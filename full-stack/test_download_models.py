import http.server,pathlib,tempfile,threading,unittest
from download_models import download
class Downloads(unittest.TestCase):
    def test_stream_and_preserve(self):
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200);self.end_headers();self.wfile.write(b'fixture')
            def log_message(self,*args):pass
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with tempfile.TemporaryDirectory() as d:
                path=pathlib.Path(d)/'model'
                self.assertEqual(download(f'http://127.0.0.1:{server.server_port}',path,7),'downloaded')
                self.assertEqual(path.read_bytes(),b'fixture')
                self.assertEqual(download('invalid',path,7),'preserved')
                self.assertEqual(list(path.parent.glob('.download-*')),[])
        finally:server.shutdown();server.server_close()
if __name__=='__main__':unittest.main()
