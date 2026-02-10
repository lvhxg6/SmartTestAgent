# Requirements Document

## Introduction

对 smart-test-agent 项目的"项目配置页面"（ProjectConfig.tsx）进行 MVP 阶段简化改造。当前配置页面过于复杂，需要简化测试范围配置（从多路由改为单路由）、将源码配置从路径输入改为文件上传方式、修复后端 schema 校验问题，并适配下游 RouteSelection.tsx 页面。数据库 schema 保持不变，通过应用层兼容。

## Glossary

- **Config_Form**: ProjectConfig.tsx 中的 Ant Design 表单组件，用于配置测试目标参数
- **Backend_Router**: targetProfile.ts 中的 tRPC 路由，处理配置的 CRUD 和校验逻辑
- **Upload_Endpoint**: 新增的 Express 文件上传接口，处理源码文件的接收和存储
- **Route_Selection_Page**: RouteSelection.tsx 页面，从 target profile 读取路由列表供用户选择测试
- **Source_Code_Config**: 源码配置数据结构，存储上传文件的路径信息
- **Target_Profile**: 测试目标的完整配置，包含浏览器、登录、路由、源码等信息

## Requirements

### Requirement 1: 测试路由简化为单路由输入

**User Story:** As a 测试人员, I want to 只配置一个测试路由, so that MVP 阶段配置更简单直接。

#### Acceptance Criteria

1. WHEN 用户打开配置页面, THE Config_Form SHALL 显示一个单行 Input 输入框用于输入测试路由（替代原来的多行 TextArea）
2. WHEN 用户提交配置, THE Config_Form SHALL 将单个路由值包装为单元素数组传递给后端（兼容数据库 allowedRoutes JSON 数组格式）
3. WHEN 已有配置数据加载时, THE Config_Form SHALL 从 allowedRoutes 数组中取第一个元素回填到单行输入框
4. THE Config_Form SHALL 移除"禁止测试的路由"（deniedRoutes）输入字段

### Requirement 2: 源码配置改为文件上传

**User Story:** As a 测试人员, I want to 通过文件上传方式提供源码文件, so that 不需要手动填写多个路径配置。

#### Acceptance Criteria

1. THE Config_Form SHALL 移除原有的4个路径输入框（前端根目录、路由文件路径、页面目录、API 目录）
2. THE Config_Form SHALL 提供"路由/菜单文件"上传区域，支持上传 1-2 个文件
3. THE Config_Form SHALL 提供"页面组件文件"上传区域，支持上传多个文件或一个 zip 包
4. WHEN 用户选择文件并提交, THE Config_Form SHALL 通过 Upload_Endpoint 将文件上传到服务器
5. WHEN 文件上传成功, THE Upload_Endpoint SHALL 返回服务器端存储路径信息
6. WHEN 配置保存时, THE Config_Form SHALL 将上传文件的路径信息作为 sourceCode 字段提交给 Backend_Router

### Requirement 3: 后端文件上传接口

**User Story:** As a 系统, I want to 提供文件上传接口, so that 前端可以上传源码文件到服务器。

#### Acceptance Criteria

1. THE Upload_Endpoint SHALL 接受 multipart/form-data 格式的文件上传请求
2. WHEN 接收到上传文件, THE Upload_Endpoint SHALL 将文件存储到本地文件系统的项目专属目录（按 projectId 隔离）
3. WHEN 文件存储成功, THE Upload_Endpoint SHALL 返回包含文件存储路径列表的 JSON 响应
4. IF 上传的文件超过合理大小限制（单文件 50MB）, THEN THE Upload_Endpoint SHALL 返回 413 错误并提示文件过大
5. IF 上传请求中缺少 projectId 参数, THEN THE Upload_Endpoint SHALL 返回 400 错误

### Requirement 4: 后端 Schema 校验修复

**User Story:** As a 测试人员, I want to 能够使用 hash 路由格式的登录 URL（如 /#/login）, so that 配置能适配实际项目的路由方式。

#### Acceptance Criteria

1. THE Backend_Router SHALL 将 loginUrl 的 zod 校验从 z.string().url() 改为 z.string()（因为 /#/login 不是合法的完整 URL）
2. THE Backend_Router SHALL 移除 validate 方法中对 loginUrl 执行 new URL() 的校验逻辑
3. THE Backend_Router SHALL 移除 deniedRoutes 相关的字段定义和校验逻辑
4. THE Backend_Router SHALL 将 sourceCodeConfigSchema 改为存储上传文件路径信息的结构（routeFiles 字符串数组 + pageFiles 字符串数组）
5. WHEN 接收到不包含 deniedRoutes 字段的请求, THE Backend_Router SHALL 正常处理而不报错

### Requirement 5: RouteSelection 页面适配

**User Story:** As a 测试人员, I want to RouteSelection 页面能正确适配新的单路由配置, so that 测试流程不受影响。

#### Acceptance Criteria

1. WHEN 从 target profile 加载路由数据, THE Route_Selection_Page SHALL 兼容 allowedRoutes 数组中只有一个元素的情况
2. WHEN allowedRoutes 为单元素数组时, THE Route_Selection_Page SHALL 正常显示该路由并允许选择

### Requirement 6: 数据库兼容性

**User Story:** As a 开发者, I want to 不修改数据库 schema, so that 避免数据迁移风险。

#### Acceptance Criteria

1. THE Backend_Router SHALL 继续使用 allowedRoutes 字段存储 JSON 字符串格式的数组（单元素数组兼容）
2. THE Backend_Router SHALL 继续使用 sourceCodeConfig 字段存储 JSON 字符串（内容结构变更为文件路径信息）
3. THE Backend_Router SHALL 继续使用 deniedRoutes 字段存储空数组的 JSON 字符串（保持数据库字段不变）
