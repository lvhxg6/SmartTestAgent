# Implementation Plan: MVP Config Simplify

## Overview

按照设计文档，分步实现项目配置页面的 MVP 简化改造。先改后端 schema 和校验，再新增文件上传接口，最后改前端表单和适配页面。使用 TypeScript，测试框架为 vitest + fast-check。

## Tasks

- [ ] 1. 后端 Schema 和校验逻辑修改
  - [x] 1.1 修改 targetProfile.ts 中的 loginConfigSchema、sourceCodeConfigSchema、targetProfileInputSchema
    - loginUrl: `z.string().url()` → `z.string()`
    - sourceCodeConfigSchema: `{ frontendRoot, routerFile, pageDir, apiDir }` → `{ routeFiles: z.array(z.string()), pageFiles: z.array(z.string()) }`
    - 从 targetProfileInputSchema 中移除 `deniedRoutes` 字段
    - 修改 upsert 方法：deniedRoutes 硬编码为 `toJsonString([])`
    - 修改 validate 方法：移除 `new URL(input.login.loginUrl)` 校验，移除 deniedRoutes 格式校验
    - 修改 dbToApiFormat：不再返回 deniedRoutes 字段
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.3_

  - [x]* 1.2 更新 targetProfile.test.ts 单元测试
    - 更新 validProfileInput 中的 sourceCode 为新结构 `{ routeFiles: [...], pageFiles: [...] }`
    - 更新 loginUrl 为 hash 路由格式 `/#/login`
    - 移除 deniedRoutes 相关的测试输入
    - 新增测试：loginUrl 接受 `/#/login` 格式
    - 新增测试：不含 deniedRoutes 的请求正常通过
    - _Requirements: 4.1, 4.3_

  - [~]* 1.3 编写 property test：loginUrl 接受任意字符串
    - **Property 2: loginUrl accepts hash route strings**
    - **Validates: Requirements 4.1, 4.2**

  - [~]* 1.4 编写 property test：sourceCodeConfig 接受文件路径数组
    - **Property 3: sourceCodeConfig accepts file path arrays**
    - **Validates: Requirements 4.4**

  - [~]* 1.5 编写 property test：deniedRoutes 始终存储为空数组
    - **Property 6: deniedRoutes invariant — always empty array**
    - **Validates: Requirements 6.3**

  - [~]* 1.6 编写 property test：target profile JSON 序列化 round-trip
    - **Property 5: Target profile JSON serialization round-trip**
    - **Validates: Requirements 6.1, 6.2**

- [~] 2. Checkpoint - 确保后端测试全部通过
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. 新增文件上传接口
  - [~] 3.1 安装 multer 依赖并创建 upload 路由模块
    - 在 apps/server 中安装 multer 和 @types/multer
    - 创建 `apps/server/src/routes/upload.ts`，实现 `POST /api/upload/:projectId`
    - multer 配置：destination 按 projectId + category 隔离，limits 单文件 50MB
    - 响应格式：`{ success: true, files: [{ originalName, storagePath, size }] }`
    - 错误处理：缺少 projectId 返回 400，文件过大返回 413
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [~] 3.2 在 index.ts 中挂载 upload 路由
    - 在 tRPC 中间件之前挂载 `app.use('/api/upload', uploadRouter)`
    - _Requirements: 3.1_

  - [~]* 3.3 编写 upload 接口单元测试
    - 测试文件存储到正确目录
    - 测试响应包含正确的文件路径信息
    - 测试缺少 projectId 返回 400
    - _Requirements: 3.2, 3.3, 3.5_

  - [~]* 3.4 编写 property test：上传文件存储和路径返回
    - **Property 4: Upload endpoint stores files and returns correct paths**
    - **Validates: Requirements 2.5, 3.2, 3.3**

- [~] 4. Checkpoint - 确保上传接口测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. 前端 ProjectConfig.tsx 改造
  - [~] 5.1 修改测试路由区域：TextArea → Input
    - 将 allowedRoutes 的 `<TextArea>` 替换为 `<Input>` 并重命名表单字段为 testRoute
    - 移除 deniedRoutes 的 `<TextArea>`
    - 修改 handleSubmit：`allowedRoutes: [values.testRoute]`
    - 修改 handleValidate：同上
    - 修改 useEffect 回填逻辑：`form.setFieldsValue({ testRoute: profile.allowedRoutes[0] })`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [~] 5.2 修改源码配置区域：路径输入 → 文件上传
    - 移除 4 个路径 Input（frontendRoot, routerFile, pageDir, apiDir）
    - 新增"路由/菜单文件"Upload 组件（Ant Design Upload，maxCount: 2）
    - 新增"页面组件文件"Upload 组件（支持多文件，accept: .tsx,.ts,.jsx,.js,.vue,.zip）
    - Upload 的 action 指向 `/api/upload/{projectId}`，附带 category 参数
    - 上传成功后从响应中提取文件路径，存入组件 state
    - 修改 handleSubmit：`sourceCode: { routeFiles: [...], pageFiles: [...] }`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [~] 5.3 修改数据加载回填逻辑
    - useEffect 中处理新格式 sourceCode（routeFiles, pageFiles）
    - 对旧格式 sourceCode 做防御性处理（字段不存在时显示空）
    - _Requirements: 1.3, 2.6_

- [ ] 6. RouteSelection.tsx 适配验证
  - [~] 6.1 验证 RouteSelection.tsx 兼容单元素 allowedRoutes 数组
    - 检查现有代码 `profile.allowedRoutes.map(...)` 对单元素数组的兼容性
    - 如需修改则适配，如无需修改则确认
    - _Requirements: 5.1, 5.2_

- [~] 7. Final checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- 数据库 schema (schema.prisma) 不做任何修改
- fast-check 已在 devDependencies 中，无需额外安装
- multer 需要新安装：`pnpm add multer` + `pnpm add -D @types/multer`（在 apps/server 目录下）
- Property tests 每个至少运行 100 次迭代
