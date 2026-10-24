# envs/ — API 키·환경변수 보관 폴더

이 폴더에는 외부 서비스 API 키 같은 비밀값을 `*.env` 파일로 둡니다.
**키 파일은 git이 추적하지 않으므로 원격 저장소로 푸시되지 않습니다.** 이 README와 키 이름만 적은 양식 파일만 추적합니다.

## 추적 규칙

| 경로 | git | 예 |
|---|---|---|
| `envs/README.md` | 추적 | 이 문서 |
| `envs/**/*.env.example` | 추적 | `openai.env.example` — 키 **이름**만, 값은 비움 |
| `envs/**/*.env` | **비추적** | `openai.env`, `.env`, `sub/prod.env` |
| `envs/**/*.env.*` | **비추적** | `openai.env.local`, `prod.env.bak` |

규칙 정본은 루트 `.gitignore` 의 `# API KEY 폴더` 절입니다.

## 파일명 규칙

```
envs/<서비스|용도>.env            # 실제 키 (비추적)
envs/<서비스|용도>.env.example    # 양식 (추적)
```

- 이름은 소문자·숫자·`_`·`-` 로 짓습니다(예: `openai.env`, `google_drive.env`).
- 같은 서비스의 환경별 값은 하위 폴더나 접미사로 나눕니다(예: `prod/openai.env`, `openai.env.local`). 둘 다 비추적입니다.

## 새 키 추가하기

1. 양식이 있으면 복사합니다: `cp envs/openai.env.example envs/openai.env`
2. `envs/openai.env` 에 값을 채웁니다.
   ```dotenv
   OPENAI_API_KEY=sk-...
   ```
3. 다른 사람도 필요한 키라면 값을 비운 양식 `envs/openai.env.example` 을 함께 만들어 커밋합니다.
   ```dotenv
   OPENAI_API_KEY=
   ```

## 푸시 전 확인

```bash
git check-ignore -v envs/openai.env   # 규칙이 출력되면 비추적(정상)
git ls-files envs                     # README.md 와 *.env.example 만 나와야 함
```

## 주의

- `.gitignore` 는 **아직 추적되지 않은 파일만** 막습니다. 키 파일을 실수로 `git add -f` 했거나 이미 커밋했다면 `git rm --cached <파일>` 로 추적을 끊고, 노출된 키는 해당 서비스에서 **폐기·재발급**하세요(이력에 남은 값은 지워지지 않습니다).
- `*.env.example` 과 이 README에는 실제 값을 절대 적지 않습니다.
- 이 폴더는 서고(`__llm-wiki`) 색인 대상이 아닙니다.
