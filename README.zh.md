# Message to Quote

客户的订单贴进来，报价单自己做好。

客户在 WhatsApp 发订单：一串清单、一张产品照片、或者整个聊天截图。丢进这个 app，AI 会读懂内容，把每一行对到你的产品表，选对价格表，认出是哪个客户，然后你就有一张报价单，可以下载 PDF，或者直接开 WhatsApp 发给客户。

[English](README.md)

![Quotations](docs/quotations.jpg)

## 最简单的装法：叫你的 AI 帮你装

在一个空的 folder 打开 [Claude Code](https://claude.com/claude-code)（或者 Codex、Cursor，任何会写 code 的 AI agent），跟它讲：

> 帮我 set up 这个 app：https://github.com/ameng-nocode/message-to-quote

（`OWNER` 换成放这个 repo 的 GitHub 账号。）AI 会照 [AGENTS.md](AGENTS.md) 一步一步做：指令它自己跑，只有几件一定要人做的事才会停下来叫你，例如拿一个免费的 AI key。它不会叫你把 key 贴在聊天里，会帮你打开 `.env` 档案，你自己贴进去。

## 它会做什么

![Add with AI](docs/quick-add.jpg)

- **什么语言的订单都看得懂**：打字、贴上来的文字、产品照片、聊天截图（英文、马来文、中文都可以）。
- **对到你的产品**：看 code、名字、款式，或者拿客户的照片跟你的产品照片比。你没有卖的东西会另外列出来，附上你有卖的最接近的产品。AI 先把整个清单给你看，你觉得对了才按 **Add**。
- **价格表**：每个产品一个标准价，再加你自己的价格表（Retail、Wholesale、Dealer 等等）。客户讲「给我 dealer 价」，整张报价单就换过去。
- **认得你的客户**：从聊天的名字、电话号码或公司名认出已存的客户；新客户就从讯息里自动填好资料。
- **你自己的报价单格式**：公司资料、logo、号码前缀、货币、税、要显示哪些栏、银行资料、页尾，全部在 Settings 改。
- **发出去**：A4 PDF、Excel、打印，或者一键打开客户的 WhatsApp 对话，讯息已经打好。
- **产品用 Excel 放进去**：import 你的价格表（一行一个产品），也可以 export 出来、加照片。

| ![Settings](docs/settings.jpg) | ![PDF](docs/pdf.png) |
|---|---|

## 两种用法

| | Browser 模式 | Supabase 模式 |
|---|---|---|
| 要准备 | 一个 AI key | AI key + 一个免费的 [Supabase](https://supabase.com) project |
| Login | 没有 | Email + password，可以有团队 |
| 资料放在哪里 | 那一个 browser 里面 | 你的 Supabase project，每台电脑看到的都一样 |
| 适合 | 试用、demo、一个人一台电脑 | 真正开工用、整个 sales 团队 |

App 自己会认：`.env` 里没有 Supabase key，就是 browser 模式。

## 先看这里

- **AI 会看到订单。** 你 import 的每个讯息、照片、截图，连同你的产品名字和小张产品照片，都会送去你用的 AI 服务（Google Gemini、OpenAI 或 OpenRouter）。订单资料敏感的话，先看清楚它们的条款。
- **AI key 是你的，放在你的 server。** Supabase 模式只有登入的团队成员可以用（每人每小时最多 `ASSIST_LIMIT_PER_HOUR` 次，默认 40）。Browser 模式没有 login，所以 Add with AI 只在你自己的电脑或家里/公司的网络用得到；放上网就自动关掉。
- **AI 做的要看一下。** 它很准，但不是百分百。每次 import 都会列出对到什么、改了什么、什么不在你的产品表。
- 跟 WhatsApp、Meta、Google、OpenAI、Supabase 没有关系。这些名字是它们各自的商标。

## 自己手动装

需要 [Node.js](https://nodejs.org) 22 或更新（20.12 也可以）和 [Git](https://git-scm.com)。

```bash
git clone https://github.com/ameng-nocode/message-to-quote.git
cd message-to-quote
npm install
npm run setup
```

`npm run setup` 会帮你做好 `.env`，再告诉你还缺什么。在 `.env` 放一个 AI key 就可以。免费的是 Gemini：去 https://aistudio.google.com/apikey 拿 key，贴在 `GEMINI_API_KEY=` 后面。

```bash
npm run dev
```

打开 http://localhost:3000，这就是 browser 模式，可以开始用了。按 **Load sample data** 会放进一个虚构的手机配件批发商的资料，再把 [demo-data/whatsapp](demo-data/whatsapp) 里的截图丢进 import 框试试看。

### 加 Supabase（login + 团队）

```bash
npm run setup:supabase -- --owner-email you@example.com
```

用你等一下要 login 的 email：只有这个 email 可以开 owner 账号。

第一次跑会要一个 Supabase access token：去 https://supabase.com/dashboard 开免费账号，在 https://supabase.com/dashboard/account/tokens 做一个 token，贴在 `.env` 的 `SUPABASE_ACCESS_TOKEN=` 后面，再跑一次。接下来它会：

1. 开一个 Supabase project（默认新加坡，要换地区用 `-- --region <名字>`），
2. 建好 table、安全规则（每个 table 只有你的团队读得到）和放照片的 private storage，
3. 把 login 设成 email + password，不用确认 email，
4. 把 owner 账号锁在你的 email，别人抢不到这个 project，
5. 把 project 地址和 public key 写进 `.env`，再把 access token 那一行清空。

重开 `npm run dev`。随时可以跑 `npm run setup:check` 看现在装到哪里。

<details>
<summary>不用 setup script 的做法</summary>

1. 在 https://supabase.com/dashboard 开一个 project。
2. `npx supabase link --project-ref <你的 ref>`，再 `npx supabase db push`（会跑 [supabase/migrations](supabase/migrations)）。
3. Dashboard，Authentication，Sign In / Providers，Email：关掉 **Confirm email**。
4. Dashboard，Project Settings，API Keys：把 project URL 和 `anon` public key 放进 `.env` 的 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。

</details>

## Login 怎样运作（Supabase 模式）

- **Owner 账号是你的。** 装好后打开 app，用你给 setup 的那个 owner email 开账号。别的 email 开不到，所以没有人可以比你先抢。
- **之后就关掉 sign up。** 只有 owner invite 过的 email 才可以开账号。这是在 database 里面挡的，不只是 app 把按钮藏起来。
- **邀请同事：** Settings，Team，加他的 email。把 app link 发给他（有 Copy app link 按钮）。他选 **Invited? Create your account**，用同一个 email 开账号。
- **移除同事：** Settings，Team，按他名字旁边的 x。他还登入得到，但什么都看不到。要整个删掉他的账号：Supabase dashboard，Authentication，Users。
- **忘记 password：** login page 会 email 一个重设 link。Supabase 自带的 email 一小时只能发几封；要更多就在 Supabase dashboard 设自己的 SMTP（Authentication，Emails）。
- **放上网后：** 在 Supabase dashboard（Authentication，URL Configuration）把 Site URL 设成你的网址，重设 password 的 link 才会开到你的 app。

## 公司资料和报价单格式

全部在 **Settings**：

- 公司：名字、公司号码、地址、电话、email、网站、logo。
- 报价单：纸上的标题、号码前缀（`QT` 会变成 `QT-ABC-2610-01`）、货币、有效几天、要显示哪些栏（照片、code、单位、折扣）、税（名字和税率，例如 SST 8%）、默认的送货和付款条件、备注、付款资料（银行户口）、页尾。
- 价格表：新增、改名、删除。
- WhatsApp：你的国家代码（给 0 开头的号码用）和跟 PDF 一起发的讯息。

## 产品和价钱

在 **Products** 页：新增、修改、复制、删除产品，可以放照片。照片不一定要，但有照片 AI 才能拿客户的产品照片来对。

整个价格表一次放进去：按 **Import**，选 Excel（.xlsx）或 CSV 档，一行一个产品：

| code | name | variant | category | unit | price | Wholesale | Dealer | description | photo |
|---|---|---|---|---|---|---|---|---|---|
| CS-RG61 | Rugged Armor Case 6.1 inch | Black | Phone Case | pcs | 29 | 18 | 15.7 | Military drop protection | |

- 一定要有的只有 `name` 和 `price`。`price` 是标准价。
- 其他有价钱的栏，会变成同名的价格表（没有的话自动开新的）。栏名里的货币和「price」这个字不算：`Wholesale Price (RM)` 会放进 Wholesale 价格表。
- 已经有的产品（同 code 同款式，没有 code 就看同名）会被更新，不会重复加。
- `photo` 可以放图片 link（https）。不然就在 app 里加照片。
- **Template** 按钮会下载一个有正确栏位的空表。[demo-data/products-sample.csv](demo-data/products-sample.csv) 是完整的例子。

### 数目是怎样算的

- Amount = 数量 x 单价，再扣掉那一行的折扣 %，四舍五入到一仙（0.945 变 0.95）。
- Subtotal = 每一行的 amount 加起来。税 = subtotal 的税 %，四舍五入到一仙。Total = subtotal + 税。
- 价钱存到 2 个小数位，数量和折扣存到 3 个（2.5 kg、1.5 小时、12.5%）。
- 新加的一行用报价单的价格表的价钱。那个产品在那个价格表没有价钱的话，先放 0，让你自己打价钱。
- 画面、打印、PDF、Excel 用的都是同一套数目。

## AI key 和费用

一个 key 就够。放几个的话，第一个没 credit 或太忙时，下一个会接手。

| `.env` 里的 key | 默认 model | 费用 |
|---|---|---|
| `GEMINI_API_KEY` | gemini-2.5-flash | 少量用有免费额度，https://aistudio.google.com/apikey |
| `OPENAI_API_KEY` | gpt-4.1-mini | 要钱，一张订单不到 1 美分 |
| `OPENROUTER_API_KEY` | google/gemini-2.5-flash | 要钱，一个 key 用很多 model |

用 `ASSIST_PROVIDERS=gemini,openai,openrouter` 换顺序，用 `ASSIST_MODEL_GEMINI` 这些换 model。

## 放上网

放上网就要用 Supabase 模式。先跑 `npm run setup:check`：要看到 `owner email lock: on` 和 `owner account: yes`。

最简单是 Vercel：import 这个 repo，把 `.env` 里的 AI key 和两个 `NEXT_PUBLIC_SUPABASE_` key 放进 Environment Variables，deploy。不要放 database password 和 access token，app 用不到。任何跑得到 Next.js 的地方都可以（Railway、Render、自己的 server 用 `npm run build && npm start`）。

然后在 Supabase dashboard（Authentication，URL Configuration）把 Site URL 设成你的网址。

Browser 模式放上网没有 login，所以 Add with AI 会关掉（不然有 link 的人都可以用你的 AI credit）。真的要开的话，在 host 的设定加 `ALLOW_PUBLIC_AI=1`，风险自己负责。

照片的 link（产品照片、logo）7 天有效，之后 app 会自己换新的。你把那个 link 给谁，谁在 7 天内就看得到那一张照片。

## 限制

- PDF 用的是内置字体，打不出中文或其他非拉丁字。这种报价单用 **Print**（在打印视窗选存成 PDF）。
- 每张订单 AI 会拿到你整个产品表。大约 2,000 个产品以内效果最好。
- Browser 模式所有东西放在 browser 的储存空间，大约 5 MB，产品照片最快把它装满。Supabase 模式没有这个限制。
- 一个 Supabase project 一间公司。

## Folder 结构

```
src/app/           页面：quotations、editor、print、customers、products、settings、login、/api/assist（AI）
src/lib/           资料：settings、products、customers、quotations、PDF 和 Excel、sample data、Supabase
supabase/          migrations（table、安全规则、storage）和 config.toml（login 设定）
scripts/setup.mjs  npm run setup / setup:supabase / setup:check
tests/             npm test：钱、价格表、号码、import 的规则（改了 src/lib 之后跑一次）
demo-data/         WhatsApp 订单截图样本和产品表样本
```

## License

MIT，看 [LICENSE](LICENSE)。
