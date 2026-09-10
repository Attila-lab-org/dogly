-- Browser MediaRecorder produces video/webm. Init + signed upload must accept it.
-- Idempotent: the same allowlist was introduced in 20260907125149; re-apply in
-- case production still has the earlier mp4/quicktime-only constraint.

update storage.buckets
set allowed_mime_types = array[
  'video/mp4',
  'video/quicktime',
  'video/webm'
]::text[]
where id = 'behavior-raw';
