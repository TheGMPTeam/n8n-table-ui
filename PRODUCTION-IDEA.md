# New: Production Job Idea

The New tab includes a required Idea text form as its only creation surface; the old New Table surface is removed (no actual tables are removed). Home generation editing and Jobs Type controls are unchanged.

Fresh published Research (`x4AirppgK2nvJGuf`) reads `Ideas` in its agent prompt. Shorts_Production has no Name, prompt or Params column. New ideas write only `Type: Research`, `Ideas`, `Status: Idea`, `Completed: false`, `Working: false`; other real columns retain native null defaults. Its scheduled pending gate accepts Research with strict native false flags. Pending rows may be processed on its existing schedule; creation itself does not dispatch.

Write: POST same-origin `/webhook/yt-wright`, `{operation: 'write', id: configured Jobs table ID, row: {data: [row]}}`. The actual acknowledgement is `[{success:true,insertedRows:1}]`, with no ID. Before/after paginated reads identify exactly one new matching row. This is not atomic identity proof under a concurrent identical external writer: ambiguous matches stop and require checking Jobs, never retrying automatically. The backend has no idempotency token.

Only existing Push dispatches the selected row through the Research bypass route. Creation never dispatches or sets Working true. Success retains an explicit Open Jobs · Research link that focuses the new row when visible under preserved filters. Validation rejects whitespace, missing/separate table configuration; errors preserve text. In-flight and uncertain writes prevent duplicate submissions. HTTP validation rejection allows correction; uncertain acknowledgement, timeout or mismatched readback locks the form pending manual Jobs reconciliation.

Verification: production-idea.test.cjs exercises validation, exact payload/table, native flags, one-write duplicate guard, acknowledgement/readback, no dispatch, errors and source identity. Real disposable schema-equivalent CRUD table verified creation/readback/native null defaults and deletion 404. No production fixture or generation call is needed.
