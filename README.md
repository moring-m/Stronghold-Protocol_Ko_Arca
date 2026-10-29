# 위수 프로토콜: 맹약 · Stronghold Protocol: Alliance

> 현재 본 Readme의 번역은 GPT에 의해 생성되었습니다. 추후 수정/검수가 필요합니다.

![version](https://img.shields.io/badge/version-0.3.3f-2ea44f)
![license](https://img.shields.io/badge/code%20license-GPL--3.0--or--later-blue)
![node](https://img.shields.io/badge/node-22%20%7C%2024-339933)

Claude Code 개발 안내: [설정·실행](docs/CLAUDE-CODE.md) · [현재 작업 인계](docs/CLAUDE-HANDOFF.md).

## 고지사항

> [!IMPORTANT]
> - 본 프로젝트는 플레이어가 제작한 **비공식 팬 메이드 작품**으로, 상하이 하이퍼그리프 네트워크 테크놀로지 유한회사(Hypergryph), Yostar 및 그 관계사와 **아무런 관계가 없으며**, 이들의 허가나 승인을 받지 않았습니다.
> - 《명일방주》 및 「위수 프로토콜」과 관련된 명칭, 캐릭터, 일러스트, 음악, 음향 효과, 텍스트 및 데이터 등의 소재에 대한 저작권은 원 권리자에게 있습니다. 이러한 소재에는 본 프로젝트의 GPL-3.0 라이선스가 **적용되지 않으며**, GPL은 본 프로젝트에서 직접 작성한 코드에만 적용됩니다.
> - 학습 및 교류와 개인적인 비상업적 사용만을 목적으로 합니다. **어떠한 형태의 영리 행위도 엄격히 금지**됩니다. 여기에는 프로젝트 또는 통합 패키지 판매, 유료 다운로드 또는 유료 배포, 유료 서버 또는 유료 대행 운영, 광고 / 후원 / 멤버십 등의 수익화 방식 및 기타 모든 상업적 이용이 포함되며 이에 국한되지 않습니다.
> - 저장소의 소스 코드에는 게임의 미술 및 오디오 소재가 포함되어 있지 않습니다(공식 데이터 테이블로 생성한 데이터와 몇 장의 게임 스크린샷만 포함되어 있으며, 이들 역시 GPL의 적용을 받지 않습니다). [Releases](../../releases/latest)의 통합 패키지에는 플레이어의 편의를 위해 소재가 포함되어 있으며, 다운로드하는 것은 본 고지사항에 동의하는 것으로 간주됩니다. 소재를 본 프로젝트 외의 용도로 사용하거나 별도로 재배포하지 마십시오. 자세한 약관은 [NOTICE.md](NOTICE.md)를 참조하십시오.
> - 권리자가 본 프로젝트가 자신의 권리를 침해한다고 판단하는 경우 Issue를 통해 연락해 주시면 **즉시** 관련 내용을 삭제하겠습니다.
> - 본 프로젝트는 「있는 그대로」 제공되며 **어떠한 보증도 제공하지 않습니다**. 사용에 따른 위험은 사용자 본인이 부담합니다.

| 동맹 방 | 전략 선택 | 정비 기간（상점 / 맹약） |
|---|---|---|
| ![房间](docs/img/room.jpg) | ![策略](docs/img/band-draft.jpg) | ![休整期](docs/img/prep.jpg) |
| **배치 방향 휠** | **전투** | **최종 공세** |
| ![方向](docs/img/facing-wheel.jpg) | ![作战](docs/img/combat.jpg) | ![最终攻势](docs/img/final-assault.jpg) |

## 目录

- [声明](#声明) · [简介](#简介) · [功能一览](#功能一览)
- [快速开始](#快速开始)：[整合包](#方式一整合包推荐) · [从源码运行](#方式二从源码运行) · [系统要求](#系统要求) · [端口与配置](#端口与配置) · [局域网联机](#和朋友一起玩局域网)
- [插件](#插件) · [联机方式](#联机方式) · [操作](#操作) · [文档](#文档) · [开发与测试](#开发与测试) · [项目结构](#项目结构)
- [许可证](#许可证) · [致谢与数据来源](#致谢与数据来源) · [贡献](#贡献)

- [고지사항](#고지사항) · [소개](#소개) · [기능 개요](#기능-개요)
- [빠른 시작](#빠른-시작)：[통합 패키지](#방법-1-통합-패키지-권장) · [소스 코드에서 실행](#방법-2-소스-코드에서-실행) · [시스템 요구 사항](#시스템-요구-사항) · [포트 및 설정](#포트-및-설정) · [친구와 함께 LAN으로 플레이](#친구와-함께-플레이-lan)
- [온라인 플레이 방법](#온라인-플레이-방법) · [조작](#조작) · [문서](#문서) · [개발 및 테스트](#개발-및-테스트) · [프로젝트 구조](#프로젝트-구조)
- [라이선스](#라이선스) · [감사 및 데이터 출처](#감사-및-데이터-출처) · [기여](#기여)

## 소개

- **独立模拟**（单人）与**同盟模拟**（1–4 人**合作**，没有 PvP；空位可以加 AI 队友）。
- 服务器是一个 Node.js 程序，**战斗在各玩家的浏览器里模拟**（和官方一样），服务器只管经济与回合，一台低功耗小主机就能开服。
- 当前版本 0.3.0：加入插件系统——外观、数据、DSL、脚本与界面插件，浏览器插件工作台和安装工具；可选的「官方特效」用本机客户端提取的官方战斗特效（完整包附带）；官方场景按客户端着色器重新打光并补上水面，伊利昂的木驮兽和「越长尘」会载客，冻结后手动刷新会取消冻结，机器人的布阵、采购和演习也有改进，详见 [CHANGELOG.md](CHANGELOG.md)。仍有少数规则按推断实现，与官方不一致的地方欢迎在 Issue 里反馈。

- **싱글 시뮬레이션**(1인)과 **동맹 시뮬레이션**(1–4인 **협동**, PvP 없음, 빈 자리는 AI 팀원을 추가할 수 있음).
- 서버는 Node.js 프로그램이며, **전투는 각 플레이어의 브라우저에서 시뮬레이션**됩니다(공식과 동일). 서버는 경제와 라운드만 관리하므로 저전력 소형 PC 한 대로도 서버를 열 수 있습니다.
- 현재 버전은 0.1.4c입니다. 첫 공개 버전(0.1.0) 이후 플레이어 피드백을 바탕으로 문제를 수정했습니다. 자세한 내용은 [CHANGELOG.md](CHANGELOG.md)를 참조하십시오. 아직 일부 규칙은 추론을 바탕으로 구현되어 있으며, 공식과 일치하지 않는 부분은 Issue로 알려주시면 감사하겠습니다.

## 기능 개요

- **한 판의 전체 진행**: 이번 판 정보 확인 → 전략 선택(40개 전략) → 14라운드 → 칭호 정산. 위험 난이도 이상에서 조건을 만족하면 15라운드 「비밀 핵심」으로 진입합니다.
- **4가지 난이도**: 표준 / 위험 / 절망 / 궁극. 싱글과 동맹에 각각 별도의 파라미터가 적용되며 모두 공식 데이터를 기반으로 합니다.
- **정비 기간**: 모집, 새로고침, 동결, 지휘 센터 업그레이드. 정비 구역과 임시 정비 구역이 있으며, 정비 구역에서 체스판으로 드래그하여 배치하고 **방향 휠**로 방향을 선택합니다. 동맹 시뮬레이션에서는 카드 풀이 공유됩니다.
- **정예 승급**: 같은 오퍼레이터 3명을 자동으로 합성하여 정예로 만들고, 한 단계 높은 등급의 무료 모집을 한 번 얻습니다.
- **오퍼레이터 및 편성**: 모집 가능한 오퍼레이터 112명(+ 정예)과 그들의 스킬, 재능 및 특성을 지원합니다. 게임 시작 전에 각 오퍼레이터가 사용할 스킬(총 283개 스킬을 모두 수작업으로 구현)과 정예의 모듈을 선택할 수 있습니다.
- **맹약 및 중첩**: 23개의 맹약(8개 세력 핵심 맹약 + 추가 맹약)을 지원합니다. 중첩 수는 한 판 전체에서 유지되며, 각 맹약은 최대 999중첩입니다.
- **장비 및 기변**: 장비와 주문을 사용하며, 같은 이름의 장비를 합성하고 특정 조합으로 맹약 효과를 부여할 수 있습니다. 이미 장착한 장비는 오퍼레이터에게 귀속됩니다. 일부 라운드 시작 전에는 기변 카드(장비, 자금, 오퍼레이터, 중첩, 현상금 등)를 선택할 수 있습니다.
- **자동 전투**: 스킬은 공식 「스킬 전략」에 따라 자동으로 발동합니다. 접촉 반경에 따라 저지하며, 저지 중인 오퍼레이터가 쓰러지면 접촉 중인 다른 오퍼레이터가 대신합니다. 원소 피해와 원소 폭발을 지원하며, 소환물은 플레이어가 직접 배치합니다. 밀치기 / 당기기는 힘과 무게를 기준으로 계산하고, 쓰러진 오퍼레이터는 그 자리에 남아 재배치 대기 시간을 표시합니다.
- **지형 및 적**: 방벽, 사격대, 오리지늄 유체 송풍기, 늪, 배기 그릴, 만조 등의 지형 장치를 지원합니다. 공중 및 지면 근처 부유 적, 현상금 적도 포함됩니다.
- **공동 방어**: 한 사람이 적을 놓치고 다른 사람이 완벽 작전을 달성한 경우, 완벽 작전을 달성한 팀원이 자신의 편성과 함께 놓친 적을 가로막으러 갑니다.
- **최종 공세 및 비밀 핵심**: 두 사람이 하나의 전장을 공유하며, 모든 팀원이 하나의 리더 체력 게이지를 함께 감소시킵니다. 10명의 적 리더와 약 5×3칸의 피격 범위를 가진 거대 리더, 그리고 공식 제한 피해 규칙을 지원합니다.
- **정산 칭호**: 위수의 별, 불멸의 맹약, 견고부동 등을 포함한 6개의 칭호.
- **접속 끊김 후 재접속**: 동맹 시뮬레이션은 접속이 끊긴 후 10분 이내에 페이지를 다시 열면 원래 자리로 돌아갈 수 있습니다. 접속이 끊긴 동안에는 기존 편성으로 자동 전투를 진행하며, 「잠시 자리 비우기」를 선택해 AI에게 맡길 수도 있습니다. 싱글 시뮬레이션은 24시간 이내에 같은 브라우저에서 돌아와 계속할 수 있습니다.
- **상호작용 세부 사항**: 적을 놓치면 상단의 목표 생명력이 실시간으로 감소합니다(최종 수치는 정산 시 확정). 선택, 드래그 앤 드롭, 장비 배치는 모두 바닥의 격자를 기준으로 합니다. 구매, 업그레이드 및 기변 카드 선택은 두 번 클릭하여 확인해야 합니다. 플레이어가 한 명뿐인 경우 전투 외에는 시간이 흐르지 않습니다.
- **그래픽 및 사운드**: 실제 Spine 캐릭터, 공식 BGM 및 효과음, 이모트(6세트 × 6개), 전투 효과를 지원합니다. 선택적으로 공식 3D 체스판을 사용할 수 있습니다(로컬 클라이언트에서 텍스처를 추출해야 합니다).
- **모바일 및 PC**: 터치 드래그와 길게 눌러 상세 정보 보기를 지원하며, 가로 화면을 권장합니다. 설정에서 그래픽 품질을 낮출 수 있습니다.

## 빠른 시작

### 방법 1: 통합 패키지 (권장)

- **完整包** `Stronghold-Protocol-v<版本>.zip`（约 800 MB，解压后约 1.16 GB）：附带全部美术 / 音频（含中文、日文、英文、韩文和本土语言的干员语音、官方 3D 棋盘贴图、各战场的官方场景和官方战斗特效），解压就能玩，不需要再下载任何东西。**推荐。**
- **精简包** `Stronghold-Protocol-v<版本>-lite.zip`（约 25 MB）：不带素材，第一次启动时自动从公开镜像下载美术、Spine 模型、音频、字体、表情和「玩法说明」教程图（约 720 MB，可中断，再次启动会续传）；官方 3D 棋盘等本地客户端素材不在其中（见下面的「本地客户端素材」；各战场的官方场景可以用 `node tools/setup.mjs --scenes` 在本机下载并提取）。适合下载大文件不方便的情况。
- **更新包** `Stronghold-Protocol-v<版本>-update.zip`（0.2.1 起提供，大小看改动多少，通常只有几 MB）：只含比之前的 0.2.x 版本改动过的文件，用来把已经装好的 0.2.x（完整包或精简包装的都行）升级到新版本，不用重新下载整个包。用法：先停止服务器（关掉窗口；装了开机自启的运行 `scripts\install-service-windows.ps1 -Stop`），把 zip 里 `Stronghold-Protocol` 文件夹的全部内容合并到安装文件夹、覆盖同名文件（Windows 资源管理器里复制粘贴即可；macOS 不要用访达拖放，它会整个替换文件夹，请用 `unzip -o`，见 [docs/DEPLOY.md](docs/DEPLOY.md) 第 1.5 节），再照常启动。启动时会先核对全部程序文件、删除新版本不再用的旧文件，然后正常运行；如果这个文件夹不是更新包对应的版本（例如 0.1.x，或者程序文件被改过），会提示下载完整包，服务器不启动。全新安装请用完整包或精简包。

两种包都包含运行和部署文件，以及插件作者需要的工具、模板、Schemas、插件文档和战斗测试助手。完整开发测试与设计文档仍在源码仓库里。

### 방법 2: 소스 코드에서 실행

```bash
git clone https://github.com/sganggs/Stronghold-Protocol.git
cd Stronghold-Protocol
npm install        # 安装依赖（postinstall 会把 pixi / preact / three 复制到 public/vendor）
npm run setup      # 检查环境，并从公开镜像下载约 720 MB 美术 / 音频（可中断，再次运行会续传）
npm start          # 启动服务器：http://localhost:3000
```

시작 스크립트(Windows `scripts\start-windows.bat`, macOS / Linux `scripts/start.sh`)를 직접 실행할 수도 있습니다. 처음 실행할 때 자동으로 의존성을 설치하고 소재를 다운로드한 뒤 서버를 시작하고 브라우저를 엽니다.

- **本地客户端素材（可选）**：官方 3D 棋盘、官方战斗特效（0.3.0「官方特效」）、部分官方界面图标（交流按钮与表情面板的边框、模组类型图标等）、灼热 / 炽焰源石虫和 39 个召唤物（多数自选召唤物）的官方模型需要从本机的《明日方舟》PC 客户端提取（Windows 原生客户端、macOS 的 CrossOver 或 PlayCover）。`npm run setup` 检测到客户端时会询问是否提取（需要 Python 3.8+，依赖装在项目内的 `.venv-extract`，不影响系统）；之后可以用 `node tools/setup.mjs --local` 重新提取，或用 `--game "<…/StreamingAssets/AB/Windows>"` 指定路径。没有客户端时游戏照常运行，这几样换成替代样式：2D 棋盘、样式相近的图标、染色的普通源石虫、召唤物头像。表情和「玩法说明」的教程图随上面的素材一起从公开镜像下载，不需要客户端。没有客户端的服务器（例如 Linux VPS）也可以从**同一版本**的整合包（完整包；精简包没有）里复制 `public/assets/local/` 和 `data/local-assets.json`，见 [docs/DEPLOY.md](docs/DEPLOY.md) 的「本地客户端素材」。
- 素材下载优先使用 GitHub，失败时自动改用 jsDelivr 镜像。
- `npm run doctor`（即 `node tools/doctor.mjs`）可以随时诊断：Node 版本、素材是否完整、端口占用、局域网地址和防火墙。

### 시스템 요구 사항

| 항목 | 요구 사항 |
|---|---|
| 开服的电脑 | Windows / macOS / Linux，Node.js 22 或 24（LTS）；磁盘约 1.2–1.4 GB（素材、依赖与本地提取的贴图、场景和特效：完整包解压后约 1.16 GB）；内存空闲约 100 MB，每局再加几 MB |
| 玩家 | 支持 WebGL 的现代浏览器（Chrome / Edge / Firefox / Safari 最新版），电脑、手机或平板（横屏） |
| 网络 | 首次进入游戏时，每位玩家要从开服的电脑下载几十 MB 素材（之后走浏览器缓存）；对局中流量很小。已有素材的玩家可以在标题画面点「导入素材包」（「下载完整素材」旁边），从素材包 zip、完整包 zip 或自己的 `public/assets` 文件夹导入，这部分美术不再从开服的电脑下载；需要 HTTPS 或 localhost（[docs/DEPLOY.md](docs/DEPLOY.md) 2.5 节）。0.3.0 的素材包 `Stronghold-Protocol-v0.3.0-assets.zip` 由维护者另行提供下载，不在 Releases 附件里 |

그래픽 카드가 약한 경우 「설정」에서 화질을 낮추거나 URL 뒤에 `?board=2d`(2D 체스판 강제 사용) / `?render=fallback`(WebGL을 사용하지 않는 간소화 화면)를 추가할 수 있습니다.

### 포트 및 설정

기본적으로 **TCP 3000** 포트를 수신합니다. 포트를 변경하려면 시작 스크립트에 `--port 3001`을 추가하거나 환경 변수 `PORT`를 설정합니다.

| 환경 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | 监听端口 |
| `HOST` | `::` | 监听地址。默认 `::` 是双栈：同一个端口同时接受 IPv6 和 IPv4；`0.0.0.0` = 只 IPv4；`127.0.0.1` = 只允许本机，放在反向代理后面时使用 |
| `SP_COMBAT` | `client` | `client`：各玩家浏览器模拟自己的战斗（服务器负载极低）；`server`：由服务器模拟并推流 |
| `SP_VERIFY` | `off` | 服务器复算客户端上报的战斗结果：`off` / `sample`（约 1/8 抽查）/ `all`（全部复算，更耗 CPU） |
| `SP_BOT_REHEARSAL` | 不设（服务器试算） | 仅 `host` 让房主浏览器帮 AI 队友试算布阵（同源 Worker，只回候选序号）；不设或 `server` 仍由服务器试算。房主无法完成时服务器用同一批候选接手。玩法插件房间始终由服务器试算。真人「AI 托管」和正式战斗不受影响 |
| `TRUST_PROXY` | `auto` | 是否信任 `X-Forwarded-For` 等转发头：`auto` 只信任来自本机 / 内网的代理；`1` 总是；`0` 从不 |
| `DEBUG` | 空 | 设为任意值输出详细日志 |
| `SP_NO_BROWSER` | 空 | 设为 `1` 时启动脚本不自动打开浏览器 |
| `SP_BOT_EMOTES` | 空 | AI 队友的对局表情回应（战斗、整备、合成、联防、收礼时即刻的 `m.emote` 广播）；设为 `0` 时整体关闭 |
| `SP_ASSET_INDEX` | 空 | 素材地址带内容哈希、浏览器长期缓存（0.2.6 起默认开启，哈希存在 `.cache/asset-hashes.json`）；设为 `0` 时关闭，素材清单原样下发 |

### 친구와 함께 플레이 (LAN)

1. 페이지를 열고 → 닉네임 입력 → **동맹 시뮬레이션** → 방 만들기를 선택합니다. 방장이 난이도를 선택하고 AI 팀원을 추가 / 제거할 수 있습니다.
2. 4자리 영문 **동맹 키** 또는 「링크 복사」로 얻은 `http://<주소>:3000/?room=키`를 친구에게 공유합니다.
3. 모두가 「준비 완료」를 누르면 방장이 시작합니다.
   방 대기실·게임·결과창에서 왼쪽 아래 말풍선 버튼으로 채팅창을 열고 닫을 수 있습니다. 닫힌 상태에도 최근 메시지 3개가 표시되고, 오래된 메시지는 흐리게 보입니다. 같은 방 참가자에게 메시지를 보내며, Enter로 전송하고 Escape로 닫습니다. 진영 선택 버튼에서 8개 진영 중 하나를 고르면 선택 안내가 채팅으로 전송되고, 닉네임 옆에 진영별 색상의 `(진영)`이 표시됩니다. 메시지는 최대 200자이며 최근 100개와 선택한 진영은 재접속 시 복원됩니다.
4. 같은 Wi-Fi / 라우터에 연결된 친구는 시작 창에 표시된 주소(예: `http://192.168.x.x:3000`)를 열면 됩니다. 열리지 않는 경우 대부분 방화벽 문제입니다. Windows 최초 실행 시 팝업에서 「개인 네트워크」를 허용하거나 `npm run doctor`를 실행하여 구체적인 명령을 확인하십시오. 게스트 Wi-Fi에서는 「AP 격리」가 활성화되어 있어 접속할 수 없는 경우도 있습니다.

페이지를 새로 고치거나 접속이 끊긴 경우, 동맹 시뮬레이션은 10분 이내, 싱글 시뮬레이션은 24시간 이내에 다시 열면 원래 자리로 돌아갈 수 있습니다. 서버는 방과 게임을 메모리에 저장하므로 **서버를 재시작하면 모든 게임이 종료됩니다**.

## 온라인 플레이 방법

## 插件

0.3.0 开发版已支持插件；不开插件时按原版游玩。

- **服主安装**：将插件文件夹放进服务器的 `plugins/`，或用 `node tools/plugin.mjs install <zip路径或HTTPS地址>` 安装；远程地址需带 `--sha256`。工作台也支持从社区目录安装和导入 Forge 工坊包。服主可在 `plugins/config.json` 限定可用插件。
- **房主开启**：在房间顶部的「原版 / 插件 ×N」面板里选外观或玩法插件、修改插件设置、选择插件模式。玩法插件的内容会由所有玩家下载并校验，房间标为「非官方」，统计总览默认不计入。
- **玩家个人设置**：「设置 → 外观插件 / 界面插件」只影响自己的浏览器；个人不能另装玩法插件改变房间规则。外观插件只换画面与声音，界面插件只读允许的对局信息。
- **自己制作**：打开启动窗口 `Studio:` 行的地址，使用 `/studio/` 插件工作台选模板、按官方名称选目标、拖放素材、实时预览、试一场并回放，最后打包分享。工作台限本机和局域网，修改需要钥匙。

脚本执行默认关闭。服主可以用 `SP_PLUGIN_SCRIPTS=sandbox` 开启沙箱脚本（或启动时加 `--scripts sandbox`；Windows 双击 `scripts\start-windows-sandbox.bat`）；原生受信任模式还需审查、固定锁文件哈希和玩家同意，公网部署需 `trusted-force`。开服设置见 [部署指南](docs/DEPLOY.md)，作者从[插件新手指南](docs/PLUGIN-GUIDE.md)开始，格式与限制见[插件参考](docs/PLUGINS.md)，接口列表见[插件 API 表](docs/PLUGIN-API.md)。

## 联机方式

친구가 같은 LAN에 있지 않은 경우 아래와 같은 일반적인 방법을 사용할 수 있습니다. 자신의 상황에 맞는 방법을 하나 선택하면 됩니다. 여기서는 간단한 소개만 제공하며, 언급된 도구와 서비스는 예시일 뿐 본 프로젝트와 아무런 관계가 없고 추천하는 것도 아닙니다. 구체적인 설치, 비용 및 사용 규칙은 각 서비스의 공식 안내를 따르십시오. 배포 세부 사항(방화벽, 부팅 시 자동 실행, 리버스 프록시 및 HTTPS, Docker)은 **[docs/DEPLOY.md](docs/DEPLOY.md)**를 참조하십시오.

| 방법 | 방법 | 적합한 경우 |
|---|---|---|
| **같은 LAN 직접 연결** | 시작 창의 LAN 주소를 친구에게 공유 | 같은 집, 기숙사 또는 PC방 |
| **네트워크 구성 도구(가상 LAN)** | 예: Tailscale, ZeroTier, EasyTier, 蒲公英. 서버를 여는 사람과 친구가 같은 도구를 설치하고 같은 네트워크에 가입한 뒤, 친구가 서버 컴퓨터의 가상 IP로 `http://<가상 IP>:3000`에 접속 | 정해진 몇 명의 지인과 플레이할 때; 인터넷에 직접 노출하지 않음. 친구도 클라이언트를 설치해야 하며 일부 도구는 계정 등록이 필요합니다. 지역이 멀 경우 릴레이를 거쳐 느려질 수 있음 |
| **NAT 통과 / 터널** | 서버를 여는 사람만 클라이언트를 실행하고 친구는 URL을 바로 엽니다. 예: 직접 구축한 frp(공인 IP 서버 필요), Cloudflare의 `cloudflared tunnel --url http://localhost:3000`(임시 주소이며 실행할 때마다 변경됨; 중국 내 접속 시 지연이 높을 수 있음), 중국의 Sakura frp와 같은 공개 터널 서비스(일반적으로 실명 인증이 필요하며 중국 본토 노드에서 웹페이지를 제공할 경우 ICP 등록 요구 사항이 있을 수 있음) | 라우터를 변경하고 싶지 않거나 공인 IP가 없는 경우. 무료 회선은 대역폭이 제한적이며 처음 소재를 로드할 때 느릴 수 있음 |
| **클라우드 서버 / VPS 직접 배포** | VPS에서 통합 패키지를 실행하거나 저장소에 포함된 `Dockerfile`을 사용합니다. Caddy / Nginx로 HTTPS를 추가합니다. 플레이어와 가깝고 회선이 좋은 지역을 선택하십시오(중국 본토 플레이어를 대상으로 할 경우 해외 데이터센터의 귀환 경로에 주의해야 하며, 그렇지 않으면 저녁 피크 시간대에 지연이 매우 높아질 수 있음; 중국 본토 서버에 도메인을 연결하려면 ICP 등록이 필요함) | 장기간 서버를 운영하고 플레이어가 서로 다른 지역에 분포한 경우 |

일반적인 주의 사항:

- 게임은 **단일 상주 Node.js 프로세스 + WebSocket**(`/ws` 경로)로 구성되며 하나의 인스턴스만 실행할 수 있고 도메인 루트 경로에 배포해야 합니다. Vercel과 같은 Serverless 플랫폼이나 GitHub Pages와 같은 정적 호스팅은 사용할 수 없습니다. 리버스 프록시는 WebSocket 업그레이드를 전달해야 합니다.
- 게임에는 계정 시스템이 없으므로 **주소를 아는 사람은 누구나 접속할 수 있습니다**. 주소는 친구에게만 공유하고 공개적으로 게시하거나 공개 로비를 만들지 마십시오. 이는 소재 저작권과 관련된 위험도 낮출 수 있습니다.
- 공인 IPv4가 있다면 라우터에서 포트 포워딩을 설정할 수도 있지만, 이는 집의 컴퓨터를 인터넷에 직접 노출시키므로 위의 방법을 우선 고려하십시오.

## 조작

| 조작 | 방법 |
|---|---|
| 购买 / 升级调度中心 / 机变选卡 | 点一次选中，再点一次确认（`D` 升级） |
| 部署 / 移动干员 | 从整备区拖到棋盘格 → 出现方向轮盘 → 往上 / 右 / 下 / 左滑动选择朝向后松手；松在中心或点「✕ 点击取消」取消。拖动时指针 / 手指所在的格子就是落点，能放下时模型直接站在这一格上（不能放下时跟在指针下） |
| 调整朝向 | 把干员拖回它自己的格子，再选方向 |
| 出售 / 撤退 / 销毁装备 | 点击单位所在的格子 → 底部按钮「出售 +1」「撤退」；也可以把棋盘上的干员拖回整备区撤退。整备区里的装备与法术只能「销毁」，已配发的装备锁定在干员身上（干员出售或合成精锐时退回整备区） |
| 装备 | 把装备拖到干员所在的格子上（每人 2 件；满了会弹出替换窗口，被替换的一件会被销毁）；法术拖到地块上并选方向 |
| 查看详情 | 右键或长按单位 / 卡牌（属性为实时数值，高于基础值为绿色、低于为红色） |
| 快捷键 | `W` 购买鼠标指向的商品（无需点击） · `R` 刷新 · `F` 冻结 · `D` 升级 · `Q` 撤退 / `X` 出售鼠标指向的干员（无需点击） · `Space` 准备就绪 · `Esc` 取消 / 关闭；除 `Esc` 外都可以在「设置 → 快捷键」里改成别的键（[玩法指南 §11](docs/PLAYING.md#11-快捷键)） |
| 方向轮盘键盘操作 | 方向键预览 · `Enter` 确认 · `Esc` 取消 |
| 暂停（独立模拟） | 作战中（含最终攻势 / 隐秘核心）点顶栏的「暂停」或按 `Space`，再点「继续作战」（或 `Space`）继续；同盟模拟的作战不能暂停 |
| 表情 | 左下角「交流」，左右滑动（或方向键）换主题，冷却 1 秒 |
| 观战 | 自己的作战结束后（或休整期）点左侧队友头像 →「前往查看」；不参战的朋友可以在大厅输入同盟密钥点「观战」（每个同盟最多 2 名观战者，本作新增） |
| 统计（本机） | 标题画面右上角、大厅、等待室的「统计」：胜率、策略通过率、称号、战斗累计和对局记录（点一行回看结算页）；只存在本机浏览器里，可以导出 / 导入，没清完第一个回合就退出的对局不计入统计（[玩法指南 §12](docs/PLAYING.md#13-统计本机)） |

完整的规则、数值和小技巧见 **[docs/PLAYING.md](docs/PLAYING.md)**（游戏内左下角也有「玩法说明」）。

## 文档

| 文档 | 内容 |
|---|---|
| [CHANGELOG.md](CHANGELOG.md) | 更新记录：每个版本修复了什么、哪些反馈经核实不是问题 |
| [docs/PLAYING.md](docs/PLAYING.md) | 玩法指南：流程、经济、招募与晋升、摆阵、联防、盟约、最终攻势、结算称号 |
| [docs/PLUGINS.md](docs/PLUGINS.md) · [docs/PLUGIN-GUIDE.md](docs/PLUGIN-GUIDE.md) | 插件格式、安装与服主策略；中文工作台入门、DSL 和对战试验 |
| [docs/DEPLOY.md](docs/DEPLOY.md) | 部署指南：Windows 开服与开机自启、防火墙、组网 / 隧道、反向代理与 HTTPS、Docker、systemd、排错 |
| [docs/WINDOWS.md](docs/WINDOWS.md) | Windows 便携包：怎么打一份「零安装」包（`scripts/make-windows-bundle.mjs`）、包里放了什么、授权注意事项 |
| [docs/DESIGN.md](docs/DESIGN.md) | 架构与契约（英文）：索引，按章节号找到文件；现行规则在 `docs/design/`（范围与目录分工、坐标与时间、战斗引擎、对局、网络协议、渲染与 UI），各次试玩和各版本的规则修订与依据在 `docs/history/` |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 代码地图（英文）：服务器、联机协议和前后端共用的战斗模拟，0.2.0 重构后的目录，数据流，黄金结果与导入边界，常见改动从哪里入手 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 参与贡献：准备环境、运行测试、忠实原则、提交与 PR 约定、怎样添加自选干员（中文，末尾附英文摘要） |
| [docs/SIM.md](docs/SIM.md) | 战斗模拟引擎参考（英文）：钩子、技能描述格式、职业默认行为 |
| [docs/META.md](docs/META.md) | 对局与经济引擎（英文）：回合流程、商店、联防、最终攻势的实现细节 |
| [docs/DATA.md](docs/DATA.md) | 由官方数据表生成的游戏数据（英文） |
| [docs/ASSETS.md](docs/ASSETS.md) | 素材来源、目录结构与清单（英文） |
| [docs/I18N.md](docs/I18N.md) | 界面语言（英文）：界面文字、游戏文本与服务器消息怎样翻译，覆盖范围；**添加一种语言只需在 `public/i18n/` 放一个语言文件**（社区翻译步骤见「Adding a language」，内容包格式见 [docs/PACKS.md](docs/PACKS.md)） |
| [docs/BALANCE.md](docs/BALANCE.md) | 难度模型与测量（英文） |
| [docs/research/](docs/research/00-INDEX.md) | 官方规则、数据与界面的调研记录 |

## 开发与测试

```bash
npm run dev                 # node --watch：改动服务器代码后自动重启
node --test                 # 单元 + 集成测试（约 3170 项；缺少素材 / 浏览器的用例会自动跳过）
SP_E2E=1 node --test test/ui/mock.e2e.test.js        # 浏览器端到端测试，需要本机 Chrome（CHROME_PATH 可指定路径）
SP_REAL_E2E=1 node --test test/ui/real.e2e.test.js   # 需要 Chrome + 已下载的素材
RENDER_E2E=1 node --test 'test/render/*.browser.test.js'   # 渲染测试，部分需要本地提取的棋盘贴图
GOLDEN_FULL=1 node --test test/golden.test.js           # 黄金结果：固定种子的整套战斗与人机对局摘要（默认只跑快速子集）
```

- 게임 데이터는 `npm run build-data`(`tools/build-data.mjs`)를 통해 공식 데이터 테이블에서 생성됩니다. `data/*.json`을 수동으로 수정하지 마십시오.
- GitHub Actions([.github/workflows/ci.yml](.github/workflows/ci.yml))는 Ubuntu 및 Windows, Node 22 / 24에서 `npm ci`, `node --test` 및 서버 스모크 테스트를 실행합니다.

## 프로젝트 구조

| 경로 | 내용 |
|---|---|
| `server/` | Node HTTP 정적 서비스 + WebSocket(`/ws`), 로비, 게임 엔진(`match/`), 전투 시뮬레이션(`sim/`, 브라우저와 서버가 공유) |
| `shared/` | 프론트엔드와 백엔드가 공유하는 상수 및 네트워크 프로토콜 |
| `public/` | 브라우저 클라이언트(네이티브 ES 모듈, PixiJS + pixi-spine, three.js 3D 체스판, Preact + htm UI) |
| `data/` | 공식 데이터 테이블에서 생성된 게임 데이터 및 소재 목록 `assets.json` |
| `tools/` | `setup.mjs` / `doctor.mjs`, 소재 다운로드 `fetch-assets.mjs`, 데이터 빌드, 로컬 추출 `local-extract/` |
| `scripts/` | 시작 스크립트(Windows / macOS / Linux), Windows 부팅 시 자동 실행 |
| `docs/` | 문서 및 조사 |
| `test/` | `node:test` 테스트 |

## 라이선스

- **코드**: 본 프로젝트에서 직접 작성한 코드는 **GPL-3.0-or-later**로 배포되며, 전문은 [LICENSE](LICENSE)를 참조하십시오. 또한 GPL 제7조에 대한 추가 허가가 제공되어 pixi-spine의 Spine Runtimes와 함께 배포할 수 있습니다([NOTICE.md](NOTICE.md) 참조).
- **게임 소재는 라이선스 범위에 포함되지 않습니다**: 《명일방주》와 관련된 일러스트, 음악, 음향 효과, 텍스트 및 데이터 등의 저작권은 원 권리자에게 있으며 GPL이 적용되지 않습니다. 사용 제한은 위의 [고지사항](#고지사항) 및 [NOTICE.md](NOTICE.md)를 참조하십시오.
- **제3자 구성 요소**는 각각의 라이선스를 따릅니다. npm을 통해 설치되는 라이브러리(통합 패키지의 `node_modules`에 각각의 라이선스 파일 포함), `tools/local-extract/aklz4.py`의 알고리즘(BSD-3-Clause), 글꼴 등은 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)에서 목록과 라이선스 전문을 확인할 수 있습니다.

## 감사 및 데이터 출처

- 게임 데이터: [Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData).
- 소재 출처: [yuanyan3060/ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource), [fexli/ArknightsResource](https://github.com/fexli/ArknightsResource), [isHarryh/Ark-Models](https://github.com/isHarryh/Ark-Models), [ArknightsAssets/ArknightsAssets2](https://github.com/ArknightsAssets/ArknightsAssets2). 글꼴은 [TimWangZi/The-font-of-Arknights](https://github.com/TimWangZi/The-font-of-Arknights) 및 Google Fonts(Noto Sans SC)에서 가져왔습니다. 자세한 내용은 [docs/ASSETS.md](docs/ASSETS.md)를 참조하십시오.
- 규칙 확인 참고 자료: [PRTS 명일방주 중국어 Wiki](https://prts.wiki/).
- LZ4AK 압축 해제: `tools/local-extract/aklz4.py`의 알고리즘은 [isHarryh/Ark-Unpacker](https://github.com/isHarryh/Ark-Unpacker)(BSD-3-Clause, MooncellWiki/UnityPy 경유)에서 가져왔으며, Unity 리소스 분석에는 [UnityPy](https://github.com/K0lb3/UnityPy)(MIT)를 사용합니다.
- 라이브러리: [PixiJS](https://pixijs.com/)(MIT), [pixi-spine](https://github.com/pixijs/spine)(MIT; 포함된 Spine Runtime은 별도로 [Spine Runtimes License](https://esotericsoftware.com/spine-runtimes-license)의 적용을 받음), [three.js](https://threejs.org/)(MIT), [Preact](https://preactjs.com/) + [htm](https://github.com/developit/htm](MIT), [ws](https://github.com/websockets/ws)(MIT).

위 프로젝트의 제작자와 유지보수자, 그리고 이 게임을 만들어 준 하이퍼그리프에 감사드립니다.

## 기여

버그, 공식 규칙과 일치하지 않는 부분 또는 개선 제안은 Issue로 알려주시고, Pull Request 제출도 환영합니다:

- 제출 전에 `node --test`를 실행하고 관련 문서도 함께 업데이트하십시오. 문서는 중국어 간체, 코드와 주석은 영어를 사용합니다.
- 제출된 코드는 GPL-3.0-or-later로 배포됩니다.
- 게임 소재 파일은 제출하지 마십시오(`public/assets/` 등의 디렉터리는 `.gitignore`에서 제외되어 있습니다).
- 한국어 패치 제공 https://arca.live/b/arknights/184879626?p=1
- 본 프로젝트는 비상업적 원칙을 유지합니다. 광고, 유료 기능, 후원 등 어떠한 형태의 수익화 기능도 제출하지 마십시오.

소통 이미지 목록은 `shared/constants.js`의 `EMOTE_THEMES`에 있으며, 원본 목록 생성기는 `tools/build-emotes.mjs`입니다. 사용자 제공 대체 이미지 36개는 `public/assets/emotes/`에 포함되어 있고, 기존 소통 ID와 파일의 연결은 `shared/emote-art.js`에서 관리합니다. 이 이미지들은 Docker 배포에 포함되어 별도 리소스 재다운로드 없이 표시됩니다.

원본 v0.1.2 업데이트를 반영했습니다. 조작 개선, 전투·스킬 수정, 오퍼레이터 편성 내보내기·가져오기, 오래 열린 페이지의 새 빌드 자동 감지를 포함합니다. 로컬 체스판 소재가 없으면 2D 체스판으로 표시하며, 공개 미러의 소통·튜토리얼 이미지를 대체 경로로 사용할 수 있습니다.

---

## English

An **unofficial, non-commercial fan remake** of Arknights' seasonal auto-chess tower-defense mode *Stronghold Protocol: Alliance*, played in the browser: solo, or 1–4 player co-op (AI teammates can fill seats). Combat is simulated in each player's browser, so a low-power PC can host.

- **Run:** download the full bundle `Stronghold-Protocol-v<version>.zip` (~800 MB, all the art inside, the Chinese, Japanese, English, Korean and own-language operator voices, the official battlefield scenes and the official battle effects included) from [Releases](../../releases/latest) — or the lite one, `…-lite.zip` (~25 MB), which downloads the art (~720 MB) on its first start; from 0.2.1 on, `…-update.zip` holds only the files changed since the earlier 0.2.x releases: stop the server, extract it over an existing 0.2.x folder and start again (the first start deletes the files the new version dropped and verifies the install) — install Node.js 22 or 24, then double-click `scripts\start-windows.bat` (Windows) or run `./scripts/start.sh` (macOS / Linux) and open <http://localhost:3000>. From source: `npm install && npm run setup && npm start` (setup downloads ~720 MB of art from public mirrors, the emotes and the how-to-play pages included; the official 3D board, some official HUD icons, two enemy models and 39 summon models are extracted from a local Arknights client — without one the game uses the 2D board and look-alike stand-ins (the summons show their avatars), and a server can copy `public/assets/local/` and `data/local-assets.json` from the full bundle of the same version).
- **Languages:** Chinese (the default), English, 日本語, 한국어 and 繁體中文 — switch on the title screen or in Settings. Game texts come from the official clients; the Japanese, Korean and Traditional Chinese interface strings are machine translations (corrections welcome: [docs/I18N.md](docs/I18N.md)).
- **Play with friends:** create a co-op room and share the 4-letter key or the `?room=KEY` link. On a LAN, use the address printed at start; otherwise use a virtual-LAN tool, a tunnel or a VPS — see [docs/DEPLOY.md](docs/DEPLOY.md).
- **Disclaimer:** not affiliated with or endorsed by Hypergryph or Yostar. All Arknights names, art, audio, text and data are © their respective owners and are **not** covered by this project's GPL licence. For study and personal non-commercial use only — no selling, paid distribution, paid servers or monetisation of any kind. Content will be removed on request of the rights holders. Provided "as is", without warranty.
- **License:** code GPL-3.0-or-later ([LICENSE](LICENSE)); game assets excluded.
