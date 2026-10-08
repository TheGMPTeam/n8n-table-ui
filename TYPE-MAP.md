# Audited Type / API Map

Display and browser lookup only; stored production rows and graphs unchanged.

## Stage display / exact wire selectors
Research ← Ideas/ReSearch; Script ← script/Script; Scenes ← scene/Scenes. Jobs partitions Shorts_Production strictly by Type; Qued/Queued is only a Status badge and never overrides Type. VideoReviwe displays Video Review. Uploaded is preserved. ScriptQued is unconfirmed and quarantined.

Video Review and Uploaded are visible but not configured, with no dispatch. The 42 ComfyUI rows remain in Home, never in Jobs. Null/unsupported production types remain visible in Unknown. Current two production rows are Script, irrespective of Qued status.

## API wire names
Case-insensitive space/underscore equivalents resolve Text to image, Image to video, FLF to video in browser lookup only. Text to image 20 is unsupported and has an empty graph; it is not an alias. Runner server supports the exact confirmed aliases in JSON; this patch does not rewrite it.

## All 24 audited control targets
| Template | Control | Source | Node.input |
|---|---|---|---|
| FLF to video | prompt | prompt column | 251:222.text |
| FLF to video | negativePrompt | Params.negativePrompt | 251:217.text |
| FLF to video | image1 | resolved scene-linked frames | 31.image |
| FLF to video | image2 | resolved scene-linked frames | 39.image |
| FLF to video | seed | Params.seed | 251:196.noise_seed |
| FLF to video | duration | Params.duration | 251:198.value |
| FLF to video | fps | Params.fps | 251:205.value |
| FLF to video | promptEnhance | Params.promptEnhance | 251:250.value |
| FLF to video | width | Params.width | 251:215.value |
| FLF to video | height | Params.height | 251:216.value |
| Image to video | prompt | prompt column | 398:364.text |
| Image to video | negativePrompt | Params.negativePrompt | 398:373.text |
| Image to video | image1 | resolved scene-linked frames | 395.image |
| Image to video | seed | Params.seed | 398:339.noise_seed |
| Image to video | seed2 | Params.seed2 | 398:338.noise_seed |
| Image to video | duration | Params.duration | 398:362.value |
| Image to video | fps | Params.fps | 398:361.value |
| Image to video | promptEnhance | Params.promptEnhance | 398:383.value |
| Image to video | width | Params.width | 398:372.value |
| Image to video | height | Params.height | 398:360.value |
| Text to image | prompt | prompt column | 57:27.text |
| Text to image | seed | Params.seed | 57:3.seed |
| Text to image | width | Params.width | 57:13.width |
| Text to image | height | Params.height | 57:13.height |

## Limitations
Video promptEnhance is bypassed by direct CLIPTextEncode.text injection. T2I negative conditioning is zeroed with no negativePrompt control. seed2 is independent. No graphs silently changed. Audit counts are time-stamped, nontransactional observations, not current execution proof.

## Required specifications
- Final assembler linked to freshly revalidated approved output snapshot
- durable final video URL and final-video approval snapshot/state
- upload destination/platform/channel plus credentials and explicit authorization
- persisted upload result video ID/URL/time/platform/status and failure retry contract

Full updater/restart/backend activation is denied. No generation or approval is authorized. Source audit report contains private production data and was not copied to Git; sanitized machine evidence is in docs/type-map.json.
