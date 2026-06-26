# GameDrop MCP Server (gamedrop-mcp)

GameDrop MCP 서버는 스팀(Steam), 에픽게임즈 스토어(Epic Games Store), GOG, 험블 번들(Humble Store) 등 다양한 플랫폼의 무료 배포 게임, 할인율 순 게임 할인 정보 검색, 플랫폼별 가격 실시간 비교 및 최저가 조회, 그리고 상세 게임 정보를 인공지능 에이전트(Kakao PlayMCP, Claude Desktop, ChatGPT MCP 등)에게 실시간으로 제공하는 모델 컨텍스트 프로토콜(MCP) 서버입니다.

## 주요 기능 및 MCP 도구 (Tools)

본 서버는 다음 5가지 핵심 MCP 도구(Tool)를 노출합니다:

1. **`gameDropFreeGames`**: 현재 주요 플랫폼에서 무료로 배포되고 있는 게임 정보 및 구매/다운로드 링크 목록을 실시간으로 가져옵니다. (에픽게임즈 스토어 포함)
   - 파라미터: `platform` (`all` | `steam` | `epic` | `gog`)
2. **`gameDropDiscounts`**: 플랫폼별 현재 할인 중인 게임의 정상가, 할인가, 할인율 및 다이렉트 구매 링크 목록을 정렬해 반환합니다.
   - 파라미터: `platform` (`all` | `steam` | `epic` | `gog`), `minDiscount` (최소 할인율 %, 기본값: 50), `limit` (조회 개수, 기본값: 20)
3. **`gameDropSearch`**: 게임명(영문/한글 키워드)으로 게임의 ID 및 스토어별 최저가 정보를 빠르게 검색합니다.
   - 파라미터: `keyword` (검색어)
4. **`gameDropComparePrice`**: 입력받은 게임 타이틀에 대해 지원되는 모든 온라인 스토어(Steam, GOG, Epic, Humble 등)의 판매 가격을 실시간으로 비교하여 원화(KRW)로 정렬하고, 가장 저렴한 최저가 스토어 정보를 반환합니다.
   - 파라미터: `title` (게임 타이틀)
5. **`gameDropGameInfo`**: 스팀 API 데이터를 실시간으로 파싱하여 게임의 상세 소개 설명(한글화 우선 제공), 개발사, 퍼블리셔, 출시일, 장르(태그), 가격을 포괄적으로 반환합니다.
   - 파라미터: `title` (게임 타이틀)

---

## 환경 변수 설정 (.env)

프로젝트 루트에 `.env` 파일을 생성하고 아래 형식을 참고하여 설정합니다:

```env
# HTTP 서버 포트 (SSE 모드일 때만 적용됨, 기본값: 3000)
PORT=3000

# 트랜스포트 기본 모드 (sse 또는 stdio)
TRANSPORT=sse

# (선택 사항) 캐싱 성능 향상을 위한 Redis 서버 설정
# REDIS_URL=redis://localhost:6379

# (선택 사항) IsThereAnyDeal API 연동 시 필요한 API Key
ITAD_API_KEY=
```

---

## 로컬 개발 및 실행

### 1. 의존성 패키지 설치
```bash
npm install
```

### 2. 개발 모드로 실행 (핫 리로드)
```bash
npm run dev
```

### 3. TypeScript 컴파일 빌드
```bash
npm run build
```

### 4. 빌드된 프로덕션 서버 시작
```bash
npm run start
```

---

## Docker 컨테이너 실행 및 빌드

이 프로젝트는 Docker 컨테이너 환경을 완벽하게 지원합니다.

### Docker 단독 빌드 및 실행
```bash
# 1. Docker 이미지 빌드
docker build -t gamedrop-mcp .

# 2. 컨테이너 백그라운드 기동 (3000번 포트 연결)
docker run -d -p 3000:3000 --name gamedrop-mcp-server --env PORT=3000 gamedrop-mcp
```

### Docker Compose 환경 실행 (Redis 캐시 포함)
```bash
docker-compose up -d --build
```
실행 후 `http://localhost:3000/health` 에 접속하여 정상 동작(Health Check) 여부를 확인할 수 있습니다.

---

## MCP 플랫폼별 등록 및 사용법

### 1. Kakao PlayMCP (SSE 기반 등록)
PlayMCP는 원격 HTTP 기반의 SSE(Server-Sent Events) 프로토콜을 사용해 MCP 서버를 등록할 수 있습니다.
- **SSE Connection URL**: `http://<서버-도메인-또는-IP>:3000/sse`
- **HTTP Method**: GET

### 2. Claude Desktop (stdio 기반 등록)
Claude Desktop App의 MCP 설정 파일(`claude_desktop_config.json`)을 다음과 같이 편집하여 추가합니다:

* Windows 경로: `%APPDATA%\Claude\claude_desktop_config.json`
* macOS 경로: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "gamedrop-mcp": {
      "command": "node",
      "args": ["C:/absolute/path/to/gamedrop-mcp/build/src/index.js", "--transport=stdio"],
      "env": {
        "ITAD_API_KEY": ""
      }
    }
  }
}
```

### 3. ChatGPT MCP (stdio/SSE 기반 등록)
사용하시는 ChatGPT MCP 커넥터 클라이언트의 지침에 따라 stdio 명령을 추가하거나, 실행 중인 SSE 서비스 URL을 기입하여 연동합니다.

---

## 아키텍처 및 복구력 (Resilience) 설계

- **안전한 로깅**: stdio 모드로 구동될 때 `stdout`으로 로그가 유출되면 JSON-RPC 직렬화 규격이 손상됩니다. GameDrop MCP는 실행 모드를 감지하여 stdio 모드에서는 모든 시스템 로그를 `stderr`로 안전하게 우회 출력을 적용했습니다.
- **예외 복구력**: Zod 스키마로 들어오는 인풋을 사전에 엄격히 검증하며, 외부 API 연동 에러가 발생해도 전체 서버의 다운타임으로 이어지지 않고 상세한 에러 원인을 JSON 결과 구조에 녹여 반환합니다.
- **이중 캐싱 시스템**: ioredis를 지원하여 분산 서버나 컨테이너 환경에서는 Redis를 사용하여 부하를 덜고, Redis가 감지되지 않거나 연결 에러가 발생할 시 로컬 메모리-TTL 캐시 방식으로 자동 대체되어 무중단 구동됩니다.
- **환율 동적 변환**: CheapShark API의 모든 달러($) 가격은 오픈 환율 API를 통해 원화(KRW)로 실시간 환산하여 한눈에 쉽게 딜을 파악할 수 있게 가공합니다.
