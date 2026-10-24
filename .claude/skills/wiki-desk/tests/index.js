// `node --test tests/` 진입점: Node 24 는 디렉터리 인자를 모듈로 해석(tests/index.js)하므로
// 여기서 같은 폴더의 *.test.ts 를 이름순으로 모두 불러 한 프로세스에서 실행한다.
import { readdirSync } from "node:fs";

const dir = new URL("./", import.meta.url);
for (const name of readdirSync(dir).filter((n) => n.endsWith(".test.ts")).sort()) {
  await import(new URL(name, dir).href);
}
