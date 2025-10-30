# RPGCanvas Editor

## 项目简介
RPGCanvas Editor 是一个基于原生 HTML5 Canvas 的 RPG Maker 风格 2D 地图编辑器。项目遵循“纯前端、零依赖”的设计理念，强调可维护的模块化结构，预计在多轮迭代中逐步完善地图绘制、素材管理与导入导出等功能。

## 当前目标
- **R1**：搭建最小可运行页面框架，完成布局、模块占位与初始化日志。
- **R2**：实现网格绘制与基础相机系统，支持平移、缩放及状态栏反馈。
- **R3**：建立地图数据模型、图层网格与基础数据层 API，为后续素材渲染与编辑工具打基础。
- **R4**：加载素材 manifest，完成素材包索引与素材面板的交互基础。

## R2 新增说明：网格、相机平移、缩放
- Canvas 采用脏渲染循环，仅在状态改变时重新绘制，提高性能。
- 渲染器内置 48×48 的网格绘制逻辑，可通过工具栏按钮即时开关。
- 相机支持鼠标中键拖动与空格+左键拖动进行平移；滚轮实现 0.5–2.0 范围的缩放，并保持鼠标位置为缩放锚点。
- 状态栏实时显示缩放百分比与鼠标在画布内的屏幕坐标，便于后续扩展世界坐标信息。

## R3 新增说明：地图与图层数据模型
- 引入 `MapData` 统一数据结构，包含地图尺寸、固定的 48×48 单元格与五个预设图层。
- 每个图层使用二维数组 `TileGrid`，单元格可存储 `TilePlacement` 或 `null`，方便序列化与调试。
- `Editor` 模块新增纯数据层 API，可创建地图、读写/删除单格图块并执行越界与参数校验。
- UI 状态栏新增地图信息显示；工具栏附加调试按钮，便于在验收时验证数据读写流程。

## R4 新增说明：素材清单与素材面板
- 新增 `Assets` 管理器，负责加载 `assets/manifest.json`，对 `tileSize`、`packs`、`tile.rect` 等关键字段进行校验。
- 所有素材在加载阶段建立 `tileId -> tileDef` 索引，控制台可通过 `Assets.getTileById('dgn.chest')` 查询定义。
- 素材面板提供素材包下拉、`tileId` 搜索过滤与缩略图按钮，点击后调用 `Editor.setSelectedTile()` 更新画笔。
- 缩略图采用 `Assets.makeTileThumb()` 生成的 48×48 离屏 Canvas；缺失图集或越界时以红底黑叉兜底并输出警告。
- 状态栏追加“画笔”字段实时显示当前选中的 `tileId`，为后续绘制工具奠定 UI 基础。

## 数据结构 Schema
```js
{
  name: "Map001",          // string：地图名称
  width: 50,                // number：地图宽度（格）
  height: 30,               // number：地图高度（格）
  tileSize: 48,             // number：单元格像素尺寸（固定）
  layers: {
    ground:    TileGrid,
    structure: TileGrid,
    prop:      TileGrid,
    overlay:   TileGrid,
    decal:     TileGrid
  },
  meta: {
    createdAt: "ISO8601",   // string：创建时间戳
    updatedAt: "ISO8601",   // string：更新时间戳
    version: "0.1.0"        // string：数据结构版本
  }
}
```
- **TileGrid**：`height` 行 × `width` 列的二维数组，单元值为 `TilePlacement` 或 `null`。
- **TilePlacement**：
  ```js
  {
    tileId: "dgn.floor_rock", // string：素材唯一 ID
    rotation: 0,               // number：旋转角度（0/90/180/270）
    flipX: false,              // boolean：水平翻转
    flipY: false,              // boolean：垂直翻转
    animOffset: 0,             // number：动画帧偏移（非负整数）
    walkable: undefined,       // boolean|undefined：可行走属性覆盖
    blocks: undefined          // boolean|undefined：阻挡属性覆盖
  }
  ```

## manifest schema
- `tileSize`：全局单元格像素尺寸，RPGCanvas 固定为 48，若 manifest 中出现其他值会在加载时抛错。
- `version`：manifest 文件自身版本号，便于后续兼容策略，本轮样例为 `0.2.0`。
- `packs[]`：素材包数组，每项包含 `name`（下拉菜单显示名）、`src`（图集文件名）和 `tiles[]`。
- `tiles[].id`：素材唯一标识字符串，用于画笔与索引。
- `tiles[].rect`：`[x, y, w, h]` 数组，描述首帧的像素区域，宽高必须等于 48。
- `tiles[].layer`：素材所在图层，限定在 `ground / structure / prop / overlay / decal`。
- `tiles[].animated`：可选的帧数，缺省视为 1，本轮缩略图仅取第 1 帧显示。
- `tiles[].walkable` / `tiles[].blocks`：可选布尔值，覆盖默认通行/阻挡属性。
- `tiles[].affordances`：可选字符串数组，描述额外交互标签（如 `stairs_up`、`ladder`）。
- `tiles[].occluderTopPx`：可选非负整数，表示墙体遮挡高度，供后续遮挡渲染使用。

## 如何扩充 manifest
1. 依据图集的 48×48 网格确定左上角坐标，将像素值填写到 `rect` 数组中。
2. 建议先为每个素材包录入少量条目测试校验，通过后再批量补全，避免一次性出错难以定位。
3. 为动画素材设置 `animated` 帧数，仍以首帧静态预览；后续 R7 将补上帧循环展示。
4. 扩写完成后可在控制台执行 `Assets.tileIndex` 或 `Assets.getTileById(id)` 检查索引结果。

## 缩略图生成策略
- `Assets.makeTileThumb()` 使用离屏 Canvas 生成 48×48 缩略图，并禁用插值以保持像素风格。
- 对于动画素材，仅绘制第 1 帧；R7 将在素材面板实现循环播放。
- 若图集缺失或 `rect` 超出范围，会绘制红底黑叉兜底，并输出 `[Assets]` 警告日志帮助排查。

## API 文档（Editor 数据层）
- `Editor.createNewMap(name, width, height) -> MapData`
  - `name` 为非空字符串，`width/height` 为 1–500 的正整数；创建时自动生成 5 个层的 `TileGrid` 并写入元数据。
- `Editor.setCurrentMap(mapData)`
  - 接受符合 Schema 的对象；校验 `tileSize`、层结构与元数据后，设置为当前地图并派发 `rpg:map-changed` 事件。
- `Editor.getCurrentMap() -> MapData | null`
  - 返回当前加载的地图引用，未加载时为 `null`。
- `Editor.inBounds(x, y) -> boolean`
  - 要求整数坐标；未加载地图或越界时抛出 `[Editor]` 前缀错误。
- `Editor.getTile(layerName, x, y) -> TilePlacement | null`
  - 校验图层名称与坐标范围，返回浅拷贝的图块数据。
- `Editor.setTile(layerName, x, y, placement)`
  - 校验 `placement` 结构（包含 `tileId`、合法旋转与布尔翻转）后写入数据，并刷新 `meta.updatedAt`。
- `Editor.removeTile(layerName, x, y)`
  - 将目标单元格写入 `null` 并刷新 `meta.updatedAt`。
- `Editor.setActiveLayer(layerName)` / `Editor.getActiveLayer()`
  - 切换或读取当前激活图层，非法图层名称会抛出 `[Editor]` 错误。

所有参数错误、越界或结构问题均会抛出带 `[Editor]` 前缀的异常，便于快速定位。

## 使用说明
1. 打开 `index.html` 即可启动编辑器，无需任何构建工具或第三方依赖。
2. 鼠标滚轮控制缩放，范围限制在 0.5–2.0；缩放时以指针所在点为锚点。
3. 按住鼠标中键拖动即可平移视图；亦可按住空格再用左键拖动完成平移。
4. 工具栏新增 `Grid` 按钮，可切换网格显示与否。
5. 工具栏提供两个调试按钮：
   - “新建 50×30 地图”调用 `Editor.createNewMap` + `Editor.setCurrentMap`，状态栏会显示 `名称(Map001) 50×30`。
   - “写入样例格 (ground,10,5)” 会写入示例 `TilePlacement` 并在控制台打印 `Editor.getTile` 的返回值。
6. 状态栏字段：
   - `名称(...) 宽×高`：显示当前地图名称与尺寸，未加载地图时显示 `无地图`。
   - `缩放`：展示当前缩放百分比（取整）。
   - `坐标`：展示鼠标在画布内的屏幕坐标；鼠标移出后恢复 `-`。

## 技术要点
- **相机与坐标换算公式**：
  - 屏幕转世界：`worldX = camera.x + screenX / camera.zoom`，`worldY = camera.y + screenY / camera.zoom`。
  - 世界转屏幕：`screenX = (worldX - camera.x) * camera.zoom`，`screenY = (worldY - camera.y) * camera.zoom`。
- **以鼠标为锚点的缩放**：
  - 在缩放前记录锚点的世界坐标 `anchorWorld`；缩放后重置相机为 `camera.x = anchorWorld.x - anchorScreenX / zoom`（Y 同理），确保锚点仍落在原屏幕位置。
- **脏渲染策略**：
  - 渲染器维护 `needsRender` 标记，仅在相机平移、缩放、尺寸变化或网格开关变化时触发 `render()`，通过 `requestAnimationFrame` 循环判断是否需要重绘。

## 目录结构
```
/ (项目根目录)
├─ index.html              # 页面入口，定义布局与脚本加载顺序
├─ css/
│  └─ styles.css           # 全局主题变量、布局与组件样式
├─ js/
│  ├─ main.js              # 应用入口，组织初始化流程与全局事件
│  ├─ renderer.js          # 渲染器，实现网格、相机与脏渲染循环
│  ├─ editor.js            # 编辑器状态与地图数据模型
│  ├─ ui.js                # UI 交互逻辑，绑定工具栏与相机控制
│  ├─ assets.js            # manifest 加载、素材索引与缩略图生成
│  └─ io.js                # 导入导出工具，提供 JSON 读写校验
├─ assets/
│  └─ manifest.json        # 示例素材清单，提供最小可运行的五个素材包
├─ data/
│  └─ .keep                # 占位文件，保持目录以存放后续示例数据
└─ README.md               # 项目文档（本文件）
```

## 运行方式
1. 直接双击 `index.html`，使用现代浏览器（推荐 Chrome / Edge）打开即可预览。
2. 若浏览器策略限制本地文件访问，可使用 VSCode Live Server 或任意静态服务器启动根目录。
3. 打开浏览器开发者工具，可在控制台看到启动日志与数据模型就绪提示，验证功能是否正常。

## 验收步骤（R4）
1. 打开 `index.html`，侧边栏会在 manifest 加载完成后显示素材包下拉、搜索框与素材缩略图网格。
2. 默认选中首个素材包（示例为 `Dungeon_A1`），可看到 `dgn.water`、`dgn.lava` 等缩略图。
3. 点击任意缩略图，状态栏的“画笔”字段更新为对应 `tileId`，按钮进入 `.selected` 高亮。
4. 切换素材包或输入关键字（如 `ladder`）可实时过滤缩略图列表。
5. 控制台保持无报错；若 PNG 缺失或 `rect` 越界，缩略图显示红底黑叉并输出 `[Assets]` 警告。
6. 在控制台执行 `Assets.getTileById('dgn.chest')`，返回的对象包含 `layer`、`rect` 等字段。
7. 控制台出现日志 `[RPGCanvas] R4 manifest+asset panel ready`，说明素材面板初始化完成。

## 验收步骤（R3）
1. 打开 `index.html`，点击工具栏“新建 50×30 地图”，状态栏应显示 `名称(Map001) 50×30`。
2. 点击“写入样例格 (ground,10,5)”按钮，浏览器控制台应打印 `sample getTile = ...`，对象内容包含 `tileId: 'dgn.floor_rock'`。
3. 在控制台执行：
   - `Editor.inBounds(10,5)` 返回 `true`，`Editor.inBounds(-1,0)` 返回 `false`。
   - `Editor.getTile('ground',10,5)` 返回 `TilePlacement`；执行 `Editor.removeTile('ground',10,5)` 后再次读取应为 `null`。
   - `IO.serialize(Editor.getCurrentMap())` 返回格式化 JSON 字符串；再通过 `IO.deserialize(字符串)` 应恢复等价对象。
4. 尝试传入非法参数（错误图层名、越界坐标、缺少 `tileId` 等）会抛出带 `[Editor]` 或 `[IO]` 前缀的错误。
5. 控制台包含日志 `[RPGCanvas] R3 data model ready`，且无未处理异常或警告。
6. 所有 JavaScript 文件保持逐行中文注释，无语法警告。

## 后续衔接
- **R4**：加载素材 manifest，补全素材元数据。
- **R5**：解析图集并实现静态贴图渲染。
- **R6**：接通放置/删除 UI，将数据层操作与渲染器打通。

## 后续路线图（第 3 ~ 15 轮概述）
- **第 3 轮**：实现基础地图数据结构与新建地图对话流程。
- **第 4 轮**：完成素材加载与缩略图渲染，占位资产替换为真实 PNG。
- **第 5 轮**：加入网格绘制优化与相机交互增强（惯性、限制边界等）。
- **第 6 轮**：实现图层可见性控制与图层排序面板。
- **第 7 轮**：添加基础绘制工具（画笔/橡皮擦）与撤销重做系统。
- **第 8 轮**：完善状态栏信息，显示地图尺寸、图层与光标世界坐标。
- **第 9 轮**：实现素材包管理界面（过滤、搜索、标记收藏）。
- **第 10 轮**：加入多地图项目支持与快速切换功能。
- **第 11 轮**：整合键盘快捷键与自定义配置存储。
- **第 12 轮**：添加辅助工具（对齐线、区域选择、填充）。
- **第 13 轮**：优化性能（离屏渲染、虚拟滚动）并增强地图体验。
- **第 14 轮**：提供导出预览与截图分享功能。
- **第 15 轮**：完成文档、单元测试与发布准备。

## 变更日志
- **R4**：完成素材清单加载、素材面板筛选与画笔状态联动。
- **R3**：完成地图数据模型、图层 API、状态栏地图信息与基础导入导出校验。
- **R2**：完成 Canvas 网格、相机平移/缩放与状态栏联动。
- **R1**：构建基础布局框架与模块化脚手架。
