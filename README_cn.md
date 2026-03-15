# ImgBin

[English](./README.md)

ImgBin 是一个 TypeScript CLI，用于生成图片资源、将现有图片导入托管库、编写可搜索的元数据、搜索托管库、创建缩略图，以及运行 provider 路由的多模态图片元数据分析。

## 环境要求

- Node.js 20+
- 访问图片生成的 HTTP API 用于 `generate`
- 配置一个用于 `annotate` / `--annotate` 的分析后端：`claude`、`codex` 或兼容的 HTTP 视觉 API

## 安装

```bash
npm install
npm run build
```

在本地开发期间，您可以无需构建直接运行 CLI：

```bash
npm run dev -- --help
```

您可以从已提交的示例引导本地配置：

```bash
cp .env.example .env
```

## 发布自动化

ImgBin 包含基于 GitHub Actions 的 npm 发布工作流，用于预发布和稳定发布渠道，外加一个 GitHub Release Drafter 工作流，使下一个稳定版本保持为草稿形式。

### 发布渠道

- 推送到 `main` 会将唯一的预发布构建发布到 npm 的 `dev` dist-tag。
- 推送到 `main` 还会通过 Release Drafter 刷新 GitHub 草稿发布说明。
- 稳定发布仅在发布标签为 `vX.Y.Z` 的 GitHub 草稿发布时发布，目标是 npm 的 `latest` dist-tag。
- 稳定发布工作流从 GitHub Release 标签获取发布版本，在 CI 内临时重写 `package.json` 为该版本，然后在发布前验证重写的清单。

### 草稿发布流程

ImgBin 现在镜像了 `repos/hagicode-desktop` 中已使用的 Release Drafter 模式。

1. 将 PR 合并到 `main`，并附上适当的发布标签（`major`、`minor`、`patch`、`feature`、`bug`、`docs` 及相关类别）。
2. 让 `repos/imgbin/.github/workflows/release-drafter.yml` 在 GitHub Releases 中刷新草稿发布说明。
3. 在 GitHub UI 中查看草稿发布。
4. 如果发布还未准备好，继续合并修复或在 GitHub 中直接删除草稿发布。
5. 准备好后，在 GitHub 中发布草稿发布。那 `release.published` 事件会触发稳定的 npm `latest` 发布工作流。

Release Drafter 仅管理草稿说明。草稿审查、删除和发布仍是原生 GitHub Release 操作；ImgBin 有意不在此基础上添加自定义的草稿生命周期脚本。

### 信任发布前提条件

在工作流能成功发布之前：

1. 为 `HagiCode-org/imgbin` GitHub 仓库配置 npm 信任发布，
2. 确保发布包所有者有权限访问 npm 上的 `@hagicode/imgbin` 包，并且
3. 保持仓库启用 GitHub Actions。

这些工作流设计为使用 GitHub OIDC 身份和来源发布，而不是长期有效的 `NPM_TOKEN`。
将信任发布配置指向仓库的单个发布工作流文件。

### 本地发布验证

在发布稳定的草稿发布之前，运行与 CI 相同的检查：

```bash
npm run build
npm test
npm run pack:check
```

对于稳定发布：

1. 确保 Release Drafter 草稿使用目标稳定标签，例如 `v0.1.1`，
2. 可选地通过将临时副本的 `package.json` 重写为 `0.1.1` 并运行 `node scripts/verify-release-version.mjs v0.1.1 /path/to/temp-package.json` 在本地模拟工作流，然后
3. 从 GitHub UI 发布该草稿发布。

稳定发布工作流检出已发布的发布标签，从 `v0.1.1` 解析 `0.1.1`，临时重写 `package.json` 为 `0.1.1`，然后在运行 `npm publish --tag latest` 之前验证重写的清单。

### 草稿发布故障排除

- 如果草稿说明为空或分类错误，请检查合并的 PR 标签与 `repos/imgbin/.github/release-drafter.yml` 的对比。
- 如果发布草稿后 `latest` 未发布，请检查 `repos/imgbin/.github/workflows/npm-publish-dev.yml` 中的 `release.published` 运行。
- 如果工作流报告版本不匹配，请将已发布的发布标签与临时 `package.json` 重写步骤输出进行比较，并在更正发布标签或清单源后重新运行。
- 如果需要丢弃待处理的稳定发布，请在发布前在 GitHub 中删除草稿发布。

## 使用指南

### 当前 HagiCode 站点工作流的快速开始

ImgBin 现在匹配之前在 `repos/site/scripts/generate-image.sh` 中使用的 Azure 图片生成请求格式。

这意味着当前推荐的设置是：

1. 为输出配置 Azure 图片生成，
2. 配置非交互式多模态分析 provider（`claude`、`codex` 或 `http`），然后
3. 直接运行 `imgbin generate` 或通过站点包装器或 CI 自动化调用它。

### 最小 `.env` 示例

将以下内容放入 `repos/imgbin/.env`：

```bash
# Azure 图片生成
IMGBIN_IMAGE_API_URL="https://<resource>.openai.azure.com/openai/deployments/<deployment>/images/generations?api-version=<version>"
IMGBIN_IMAGE_API_KEY="<azure-api-key>"

# ImgBin 也支持的可选回退名称
# AZURE_ENDPOINT="https://<resource>.openai.azure.com/openai/deployments/<deployment>/images/generations?api-version=<version>"
# AZURE_API_KEY=""<azure-api-key>"

# 选择一个元数据分析后端
IMGBIN_ANALYSIS_PROVIDER="codex"

# Codex 多模态分析
IMGBIN_CODEX_CLI_PATH="codex"
IMGBIN_CODEX_MODEL="gpt-5-codex"
# 如果 Codex 已全局配置则可选
# IMGBIN_CODEX_BASE_URL="https://api.openai.com/v1"
# IMGBIN_CODEX_API_KEY="<codex-api-key>"

# 仍可用的 Claude 兼容分析
# IMGBIN_ANALYSIS_PROVIDER="claude"
# IMGBIN_ANALYSIS_CLI_PATH="claude"
# IMGBIN_ANALYSIS_API_MODEL="glm-5"
# ANTHROPIC_MODEL="glm-5"

# 或者通过兼容的 HTTP 视觉端点路由分析
# IMGBIN_ANALYSIS_PROVIDER="http"
# IMGBIN_VISION_API_URL="https://example.com/vision"
# IMGBIN_VISION_API_KEY="<vision-api-key>"
# IMGBIN_VISION_API_MODEL="vision-model"

# 可选运行时调整
IMGBIN_DEFAULT_OUTPUT_DIR="./library"
IMGBIN_IMAGE_API_TIMEOUT_MS="60000"
IMGBIN_ANALYSIS_TIMEOUT_MS="60000"
```

注意：

- `IMGBIN_IMAGE_API_URL` / `IMGBIN_IMAGE_API_KEY` 是首选名称。
- `AZURE_ENDPOINT` / `AZURE_API_KEY` 作为兼容回退被接受。
- GPT Image 仅用于图片生成。
- `IMGBIN_ANALYSIS_PROVIDER` 默认为 `claude`，以保持向后兼容。
- 所有三个分析后端共享相同的场景感知提示构建器、验证规则和元数据来源字段。

## 环境变量

### 图片生成 provider

- `IMGBIN_IMAGE_API_URL`：`generate` 和创建新图片的批量作业必需
- `IMGBIN_IMAGE_API_KEY`：图片 API 的可选 bearer 令牌
- `IMGBIN_IMAGE_API_MODEL`：存储在元数据中的可选模型标识符
- `IMGBIN_IMAGE_API_TIMEOUT_MS`：可选超时覆盖，默认为 `60000`
- `AZURE_ENDPOINT`：`IMGBIN_IMAGE_API_URL` 的兼容回退
- `AZURE_API_KEY`：`IMGBIN_IMAGE_API_KEY` 的兼容回退

### 多模态分析路由

- `IMGBIN_ANALYSIS_PROVIDER`：选择 `claude`、`codex` 或 `http`；默认为 `claude`
- `IMGBIN_ANALYSIS_PROMPT_PATH`：可选覆盖捆绑的默认提示文件
- `IMGBIN_ANALYSIS_TIMEOUT_MS`：分析 provider 的共享超时回退，默认为 `60000`

### Claude CLI 分析

- `IMGBIN_ANALYSIS_CLI_PATH`：可选的本地 Claude 可执行文件路径；默认为 `claude`
- `IMGBIN_CLAUDE_CLI_PATH`：Claude 可执行文件路径的显式别名
- `IMGBIN_ANALYSIS_API_MODEL`：ImgBin 本地 Claude 分析的首选模型标识符
- `IMGBIN_CLAUDE_MODEL`：Claude 模型标识符的显式别名
- `ANTHROPIC_MODEL`：当未设置 `IMGBIN_ANALYSIS_API_MODEL` 时使用的共享回退 Claude 模型标识符
- `IMGBIN_CLAUDE_TIMEOUT_MS`：本地 Claude 进程的可选超时覆盖

如果未设置 `IMGBIN_ANALYSIS_PROMPT_PATH`，ImgBin 回退到 `prompts/default-analysis-prompt.txt`。
如果 `IMGBIN_ANALYSIS_API_MODEL` 为空，ImgBin 回退到 `ANTHROPIC_MODEL`。

### Codex CLI 分析

- `IMGBIN_CODEX_CLI_PATH`：可选的 Codex 可执行文件路径；默认为 `codex`
- `IMGBIN_CODEX_MODEL`：可选的 Codex 模型标识符
- `IMGBIN_CODEX_TIMEOUT_MS`：Codex 进程的可选超时覆盖
- `IMGBIN_CODEX_BASE_URL`：可选的 base URL 覆盖，作为 `OPENAI_BASE_URL` 转发
- `IMGBIN_CODEX_API_KEY`：可选的 API 密钥覆盖，作为 `CODEX_API_KEY` 转发

### HTTP 视觉分析

- `IMGBIN_VISION_API_URL`：当 `IMGBIN_ANALYSIS_PROVIDER=http` 时必需
- `IMGBIN_VISION_API_KEY`：HTTP 视觉 API 的可选 bearer 令牌
- `IMGBIN_VISION_API_MODEL`：存储在元数据中的可选模型标识符
- `IMGBIN_VISION_API_TIMEOUT_MS`：HTTP 视觉 API 的可选超时覆盖

ImgBin 为每个基于 CLI 的分析请求附加运行时场景配置文件和文件名指导。导入的资源优先使用原始源文件名，生成的资源回退到托管的 slug，而占位符名称如 `original.png` 或 `asset` 会被忽略。文件名始终只是软提示；当文件名与图片本身不一致时，可见图片证据仍优先。

### 通用运行时

- `IMGBIN_DEFAULT_OUTPUT_DIR`：可选的默认输出根，默认为 `./library`
- `IMGBIN_THUMBNAIL_SIZE`：可选的缩略图大小（像素），默认为 `512`
- `IMGBIN_THUMBNAIL_FORMAT`：可选的缩略图格式，默认为 `webp`
- `IMGBIN_THUMBNAIL_QUALITY`：可选的缩略图质量，默认为 `82`

## 统一工作流

### 使用 Azure + 多模态元数据分析生成一张图片

```bash
imgbin generate \
  --prompt "A cheerful hand-drawn hero illustration of an AI coding assistant helping a developer at a desk." \
  --output ./library \
  --analysis-context "This is a documentation hero illustration with a desk scene and AI assistant visual motif." \
  --annotate
```

发生的情况：

1. ImgBin 发送 Azure 风格的图片请求，
2. 将生成的文件写入托管的资源目录，
3. 通过配置的 provider 路由多模态分析，
4. 在接受返回的 JSON 之前验证它，然后将结构化元数据加上 provider 来源存储在 `metadata.json` 中。

### 从原始提示文本生成

```bash
imgbin generate \
  --prompt "orange dashboard hero for docs" \
  --output ./library \
  --tag dashboard \
  --tag hero \
  --analysis-context "This is a docs hero image that mixes product-dashboard cues with illustration styling." \
  --annotate \
  --thumbnail
```

### 从 docs 风格的 `prompt.json` 生成

```bash
imgbin generate \
  --prompt-file ../docs/src/content/docs/img/product-overview/value-proposition-ai-assisted-coding/prompt.json \
  --output ./library \
  --analysis-context "This prompt file generates a documentation hero asset with interface-inspired card layout." \
  --annotate
```

ImgBin 读取 docs 提示文件，提取 `userPrompt`，将生成参数转移到元数据，并记录提示文件路径作为提示来源。

### 仅重新运行元数据

如果图片生成已经成功，您只想刷新标题/标签/描述：

```bash
imgbin annotate ./library/2026-03/orange-dashboard-hero \
  --analysis-context "This is a product dashboard screenshot used in docs." \
  --overwrite
```

这在更改配置的分析 provider、模型或提示后很有用。

### 文件名引导分析

ImgBin 现在用轻量级文件名提示丰富多模态元数据分析：

- 导入的资源优先使用 `source.originalPath` 中的源文件名，
- 生成的资源回退到托管的资源 slug 或目录名称，
- 占位符名称如 `original.jpg` 或 `asset` 会自动跳过。

此指导在运行时附加，因此它既适用于捆绑的默认提示，也适用于任何 `--analysis-prompt` 覆盖。将其视为软提示：如果文件名与图片本身冲突，可见图片内容应优先。

### 非交互式 provider 示例

CI 中的 Codex：

```bash
IMGBIN_ANALYSIS_PROVIDER=codex \
IMGBIN_CODEX_CLI_PATH=codex \
IMGBIN_CODEX_MODEL=gpt-5-codex \
imgbin annotate ./library/2026-03/orange-dashboard-hero \
  --analysis-context "This is a product dashboard screenshot used in CI validation." \
  --overwrite
```

自动化中的 HTTP provider：

```bash
IMGBIN_ANALYSIS_PROVIDER=http \
IMGBIN_VISION_API_URL=https://example.com/vision \
IMGBIN_VISION_API_KEY=token \
imgbin annotate ./library/2026-03/orange-dashboard-hero \
  --analysis-context "This is a product dashboard screenshot used in automation." \
  --overwrite
```

### 为现有托管资源添加注释

```bash
imgbin annotate ./library/2026-03/orange-dashboard-hero \
  --analysis-context "This is a product dashboard screenshot with KPI cards and navigation."
```

### 将独立图片导入库，然后分析

```bash
imgbin annotate ./incoming/launch-hero.png \
  --import-to ./library \
  --analysis-context "This is a launch hero visual combining marketing illustration and interface framing." \
  --tag imported \
  --thumbnail
```

这会在写入 `metadata.json` 之前将源图片复制到新的托管资源目录。

### 使用自定义分析提示重新运行分析

```bash
imgbin annotate ./library/2026-03/orange-dashboard-hero \
  --analysis-prompt ./prompts/custom-analysis-prompt.txt \
  --analysis-context "This is a product dashboard screenshot used for launch documentation." \
  --overwrite
```

### 为棘手的截图添加自定义分析上下文

图片识别现在需要分析上下文。传递一个简短的项目感知提示，以便 ImgBin 可以更准确地分类棘手的截图，同时仍优先考虑可见的图片证据。

```bash
imgbin annotate ./library/2026-03/adventure-squad \
  --analysis-context "这是冒险团副本管理页面，重点识别副本配置、队伍编成、已分配英雄和右侧编辑器面板。" \
  --overwrite
```

您也可以将上下文存储在文件中：

```bash
imgbin annotate ./library/2026-03/adventure-squad \
  --analysis-context-file ./prompts/adventure-squad-context.txt \
  --overwrite
```

`annotate`、`generate --annotate` 和任何执行识别的批量作业必须提供 `--analysis-context` 或 `--analysis-context-file`（或清单等效项 `analysisContext` / `analysisContextFile`）。

### 生成或刷新缩略图

```bash
imgbin thumbnail ./library/2026-03/orange-dashboard-hero
```

### 搜索托管库

搜索匹配可以使用资源标题、标签、描述、生成的提示文本、导入来源和托管资源路径。

```bash
imgbin search \
  --library ./library \
  --query "orange hero" \
  --exact
```

对于容忍拼写错误的检索，切换到模糊匹配：

```bash
imgbin search \
  --library ./library \
  --query "orng herp" \
  --fuzzy
```

要在搜索前重建库索引：

```bash
imgbin search \
  --library ./library \
  --query "dashboard" \
  --reindex
```

要从脚本中使用结果：

```bash
imgbin search \
  --library ./library \
  --query "launch hero" \
  --json
```

ImgBin 将可重用的搜索索引存储在库根目录下的 `.imgbin/search-index.json`。现有库不需要迁移；索引在首次搜索时惰性创建，并在生成、导入、注释和缩略图操作后尽可能自动刷新。

### 运行批量清单

```bash
imgbin batch --manifest ./jobs/launch.yaml --output ./library
```

每个执行识别的清单作业必须包含 `analysisContext` 或 `analysisContextFile`。

### 批量处理待处理或失败的资源

```bash
imgbin batch \
  --pending-library ./library \
  --analysis-context-file ./prompts/pending-library-context.txt
```

## 批量清单示例

```yaml
jobs:
  - promptFile: ../docs/src/content/docs/img/product-overview/value-proposition-ai-assisted-coding/prompt.json
    slug: docs-ai-assisted-coding
    tags: [docs, hero]
    annotate: true
    analysisContext: This is a product hero illustration used in documentation.
    thumbnail: true

  - assetPath: ./incoming/marketing-card.png
    importTo: ./library
    analysisContext: This is a marketing image with product-card framing and interface accents.
    tags: [marketing, imported]
    thumbnail: true

  - assetPath: ./library/2026-03/existing-card
    overwriteRecognition: true
    analysisPromptPath: ./prompts/custom-analysis-prompt.txt
    analysisContextFile: ./prompts/existing-card-context.txt

  - pendingLibrary: ./library
    analysisContextFile: ./prompts/pending-library-context.txt
```

## 元数据模型

每个资源目录存储一个 `metadata.json` 文件，包含以下高级部分：

- `source`：资源是由 ImgBin 生成还是从外部文件导入
- `generated`：提示文本、provider 上下文、docs 提示来源和生成参数
- `recognized`：多模态分析建议、provider 来源、验证器诊断、重试历史和可选的自定义上下文来源
- `manual`：人工维护的标题、标签或描述，默认情况下优先
- `status`：生成、识别和缩略图创建的每步状态
- `paths`：原始和缩略图资源的相对文件路径
- `timestamps`：创建和更新时间戳

人工字段始终优于 AI 建议，除非您运行明确的覆盖流程。识别失败会将资源保留在磁盘上，并将资源标记为可稍后批量处理。

### 重要负载说明

ImgBin 不会将大型图片 base64 blob（如 Azure `b64_json`）持久化到 `metadata.json` 中。
实际生成的图片作为资源文件存储在磁盘上，而元数据仅保留诊断所需的结构化字段和轻量级 provider 详情。

## 分析行为说明

ImgBin 通过配置的 provider 路由元数据分析。对于基于 CLI 的 provider，它：

1. 加载捆绑的或覆盖的分析提示，
2. 在运行时附加场景感知指导和文件名提示，
3. 让选定的 provider 直接检查本地图片（`claude` 按路径，`codex` 按 `--image`，或 HTTP 按 base64 有效负载），然后
4. 在将返回的 JSON 合并到元数据之前验证它。

这意味着非交互式运行只需要确定的 provider 选择加上相应的 CLI/API 配置。

## 图片 provider 请求说明

内置 provider 现在已针对之前站点工作流使用的 Azure 图片生成请求格式进行了优化。

### 当前 Azure 风格请求体

```json
{
  "prompt": "orange dashboard hero for docs",
  "size": "1024x1024",
  "quality": "high",
  "output_compression": 100,
  "output_format": "png",
  "n": 1
}
```

### 支持的响应格式

1. 带 `data[0].b64_json` 的 Azure JSON
2. 原始图片字节（`Content-Type: image/png` 等）
3. 带 `imageBase64` 的 JSON
4. 带 `imageUrl` 的 JSON

## 仓库规范

此仓库默认忽略本地构建输出和生成的资源库：

- `dist/`
- `node_modules/`
- `.env*`
- `library/`
- 临时测试输出目录如 `.tmp/` 和 `.vitest-temp/`

如果您想提交示例资源，请将它们放在被忽略的运行时目录之外，并明确记录它们。

## 开发工作流

```bash
npm install
npm run test
npm run build
```
