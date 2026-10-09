# Scene Production CRUD input repair — October 8, 2026

Latest Scene Production execution `58046` was marked success because Call 'Data Table CRUD' uses continueErrorOutput; its child `58054` failed at Update row (dataTable): `Validation error with data table request: Data columns must not be empty`.

Actual caller shape: `{output: "{...scenes:[...]...}"}` (a JSON string, not an object). Old mapping `JSON.stringify($json.output.scenes)` produced undefined; the serialized child input was `{operation:"update",id:"vN5vMR56WpEsdLMn",row:{},match:{id:1}}`. No production retry was performed.

Only changed nodes:
- Scene Production (`TWMnQqnEwD7qTfbp`): Call 'Data Table CRUD' row expression parses string output or accepts structured object output, requires nonempty scenes, serializes Scenes.
- Data Table CRUD (`5x0Dy4rbBRZfov7K`): Normalize Input rejects empty/nonobject update patches. Workflow callers fail visibly; webhook callers get structured HTTP400.

Published and exact active graph verified:
- Scene: `b869cd48-6dbd-4de6-90e9-023b0f90ffa4`
- CRUD: `a5cec502-d6c7-4bf5-8b4e-10dfe203f042`

Native evidence: before `58064/58065` reproduced original empty-columns failure; after clone `58073/58074` evaluated repaired string mapping and `58075/58076` structured mapping. Final helper `58083` called actual published CRUD child `58084`, both success. Native direct get succeeded without a webhook in the child, so no response routing change was needed. Registration propagation briefly used an earlier helper graph immediately after publish; final evidence explicitly checked metadata.workflowId and published graph, not HTTP200 alone.

Disposable table Scenes update readback matched captured output; Type/Working/Completed stayed unchanged. Empty update returned structured400 through both native CRUD webhook and deployed UI same-origin proxy; deployed proxy read returned200. Helper, clone and captured disposable table cleanup each verified404.

Production rows, locks, generation, acknowledgements, CRUD responseNode webhooks, UI POST dispatch, 60-second refresh, New Job, services and dirty local UI sources unchanged. End-to-end generation not exercised.

Private captured inputs, fresh backups, executions and progress: `/home/dad/.hermes/cache/scratch/scene-crud-resume-20261008222121` (directory mode0700).

Run focused regression: `node scene-crud-regression.test.cjs`.
