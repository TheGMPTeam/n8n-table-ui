"""Output-deletion primitive; the companion helper keeps production inactive.

Only a trusted coordinator may supply parts resolved from fresh server rows.
Deployment must provide an exclusively writable output tree: dirfds prevent
symlink traversal but cannot serialize a concurrent external directory rename.
"""
import os
import re
import stat
from urllib.parse import urlsplit, parse_qsl


def resolve_output(url, authorities, verified_default_output=False):
    parsed = urlsplit(url)
    if parsed.scheme != 'http' or parsed.netloc not in authorities or parsed.path != '/view' or parsed.fragment or parsed.username or parsed.password:
        raise ValueError('Output URL authority/path rejected')
    if re.search(r'%(?![0-9A-Fa-f]{2})', parsed.query):
        raise ValueError('Malformed encoding')
    pairs = parse_qsl(parsed.query, keep_blank_values=True, strict_parsing=True, errors='strict')
    query = dict(pairs)
    if len(query) != len(pairs) or set(query) - {'filename', 'subfolder', 'type'} or query.get('type', 'output' if verified_default_output else None) != 'output':
        raise ValueError('Only verified output URLs supported')
    name = query.get('filename', '')
    folder = query.get('subfolder', '')
    parts = tuple(folder.split('/')) + (name,) if folder else (name,)
    if '/' in name or any(not p or p in ('.', '..') or '\\' in p or '\x00' in p or any(ord(c) < 32 for c in p) for p in parts):
        raise ValueError('Unsafe output path')
    if not name.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.mov', '.mkv')):
        raise ValueError('Not supported image/video output')
    return parts


class DeleteCoordinator:
    """Requires serialized requests and trusted, paginated server adapters.

    busy() must freshly check running executions and workflow-scoped locks,
    failing closed if either cannot be read. record() must durably fsync intent
    before unlink; adapters must never route deletion through yt-remove.
    Not wired to production until those contracts are independently verified.
    """
    def __init__(self, output, authorities, table, rows, busy, delete_row, intent, record, verified_default_output=False):
        self.output, self.authorities, self.table = output, authorities, table
        self.rows, self.busy, self.delete_row = rows, busy, delete_row
        self.intent, self.record = intent, record
        self.verified_default_output = verified_default_output

    def delete(self, source, row_id, expected_url):
        if source != self.table or isinstance(row_id, bool) or not isinstance(row_id, int) or not 0 < row_id <= 9007199254740991:
            raise ValueError('Exact positive Home row ID required')
        key = str(row_id)
        rows = self.rows()
        found = [r for r in rows if r.get('id') == row_id]
        old = self.intent(key)
        if not found and old and old.get('url') == expected_url and old.get('table') == source and old.get('root') == self.output.root and old.get('file_deleted') is True:
            parts = resolve_output(expected_url, self.authorities, self.verified_default_output)
            try:
                self.output.inspect(parts)
            except FileNotFoundError:
                if self.busy():raise ValueError('Active execution prevents retry verification')
                self.record(key, dict(old, row_deleted=True))
                return {'id':row_id, 'fileDeleted':True, 'rowDeleted':True}
            raise ValueError('Output recreated after recorded deletion')
        if len(found) != 1:
            raise ValueError('Exact existing row required')
        row = found[0]
        if row.get('URL') != expected_url or not expected_url or row.get('Working') is not False or row.get('Completed') is not True or self.busy():
            raise ValueError('Stale, active, or incomplete Home row')
        parts = resolve_output(row['URL'], self.authorities, self.verified_default_output)
        for other in rows:
            if other.get('id') == row_id or not other.get('URL'):
                continue
            try:
                shared = resolve_output(other['URL'], self.authorities, self.verified_default_output) == parts
            except ValueError:
                # Unresolvable references cannot safely prove exclusive ownership.
                raise ValueError('Another row has an unresolvable output reference')
            if shared:
                raise ValueError('Output shared with another row')
        old = self.intent(key)
        verified_retry = old and old.get('url') == expected_url and old.get('table') == source and old.get('root') == self.output.root and old.get('file_deleted') is True
        if not verified_retry:
            identity = self.output.inspect(parts)
            # Re-read immediately before unlink. An external writer race remains;
            # production must share the same deletion/generation exclusion lock.
            if self.rows() != rows or self.busy():
                raise ValueError('Queue changed during preflight')
            entry = {'table': source, 'root': self.output.root, 'url': expected_url, 'identity': identity, 'file_deleted': False}
            self.record(key, entry)
            self.output.remove(parts, identity)
            entry['file_deleted'] = True
            self.record(key, entry)
        else:
            try:
                self.output.inspect(parts)
            except FileNotFoundError:
                pass
            else:
                raise ValueError('Output recreated after recorded deletion')
        if self.rows() != rows or self.busy():
            raise RuntimeError('File deleted; row retained because queue changed')
        try:
            self.delete_row(row_id, expected_url)
            if any(r.get('id') == row_id for r in self.rows()):
                raise RuntimeError('Exact row absence not verified')
        except Exception as exc:
            raise RuntimeError('File deleted; row retained or deletion unverified; retry recorded intent') from exc
        self.record(key, {'table': source, 'root': self.output.root, 'url': expected_url, 'file_deleted': True, 'row_deleted': True})
        return {'id': row_id, 'fileDeleted': True, 'rowDeleted': True}


class OutputRoot:
    def __init__(self, root):
        self.root = os.path.abspath(root)
        if os.path.realpath(self.root) != self.root:
            raise ValueError('Canonical non-symlink root required')
        st = os.stat(self.root, follow_symlinks=False)
        self.root_identity = (st.st_dev, st.st_ino)

    def verify_ancestry(self, fd, parts):
        st = os.stat(self.root, follow_symlinks=False)
        if (st.st_dev, st.st_ino) != self.root_identity:
            raise ValueError("Output root replaced")
        current = os.dup(fd)
        try:
            for _ in parts[:-1]:
                parent = os.open("..", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=current)
                os.close(current); current = parent
            st = os.fstat(current)
            if (st.st_dev, st.st_ino) != self.root_identity:
                raise ValueError("Output directory relocated outside root")
        finally:
            os.close(current)

    def parent(self, parts):
        if not parts or any(not p or p in ('.', '..') or '/' in p or '\\' in p or '\x00' in p for p in parts):
            raise ValueError('Unsafe components')
        fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            for part in parts[:-1]:
                next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                os.close(fd)
                fd = next_fd
            self.verify_ancestry(fd, parts)
            return fd
        except BaseException:
            os.close(fd)
            raise

    @staticmethod
    def identity(fd, name):
        st = os.stat(name, dir_fd=fd, follow_symlinks=False)
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
            raise ValueError('Existing single-link regular file required')
        return (st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns)

    def inspect(self, parts):
        fd = self.parent(parts)
        try:
            identity = self.identity(fd, parts[-1])
            if not os.access('.', os.W_OK | os.X_OK, dir_fd=fd):
                raise PermissionError('Output parent not writable')
            return identity
        finally:
            os.close(fd)

    def remove(self, parts, expected):
        fd = self.parent(parts)
        try:
            if self.identity(fd, parts[-1]) != expected:
                raise ValueError('Output changed since inspection')
            self.verify_ancestry(fd, parts)
            os.unlink(parts[-1], dir_fd=fd)
            os.fsync(fd)
            self.verify_ancestry(fd, parts)
            try:
                os.stat(parts[-1], dir_fd=fd, follow_symlinks=False)
            except FileNotFoundError:
                return
            raise RuntimeError('File absence not verified')
        finally:
            os.close(fd)
