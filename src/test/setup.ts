import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.ASSISTANT_DB_PATH = join(
  tmpdir(),
  `focusflow-test-${process.pid}.sqlite`,
);
