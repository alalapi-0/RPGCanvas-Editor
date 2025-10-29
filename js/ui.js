/* =============================================
 * 模块：UI 用户界面交互
 * 描述：初始化界面控件、绑定网格开关与相机平移缩放事件
 * 说明：第 2 轮实现 Canvas 相机控制与状态栏信息更新
 * ============================================= */

(function () {
  // 使用立即执行函数包裹模块，保持内部变量私有。
  const UI = {
    // 定义 UI 对象，用于集中管理界面元素与事件处理。
    elements: {}, // 存储关键 DOM 引用，方便在其他方法中访问。
    renderer: null, // 缓存渲染器实例引用，避免频繁读取全局。
    editor: null, // 缓存编辑器实例引用，读取交互状态。
    status: { zoom: null, pos: null }, // 保存状态栏节点引用，便于快速更新。
    panOrigin: { x: 0, y: 0 }, // 记录开始平移时的屏幕坐标，用于计算位移。

    init({ canvas, toolbar, sidebar, statusbar }) {
      // 初始化方法，接收界面所需的核心元素。
      if (!canvas || !toolbar || !sidebar || !statusbar) {
        // 校验必须元素是否全部提供，缺失时抛出错误。
        throw new Error('UI.init 缺少必要 DOM 节点'); // 提醒调用方修正参数。
      }
      this.elements.canvas = canvas; // 保存 Canvas 引用供事件使用。
      this.elements.toolbar = toolbar; // 保存工具栏引用，用于插入按钮。
      this.elements.sidebar = sidebar; // 保存侧边栏引用，后续继续扩展。
      this.elements.statusbar = statusbar; // 保存状态栏引用，便于批量查询。
      this.renderer = window.RPG.Renderer; // 读取全局渲染器实例以便调用相机接口。
      this.editor = window.RPG.Editor; // 读取全局编辑器实例以同步交互状态。
      this.cacheStatusbarNodes(); // 预缓存状态栏节点引用。
      this.setupToolbar(); // 构建工具栏按钮并绑定网格开关。
      this.setupSidebar(); // 维护侧边栏占位内容，保持首轮结构。
      this.setupStatusbar(); // 设置状态栏默认文案。
      this.bindCanvasEvents(); // 绑定 Canvas 上的鼠标与滚轮事件。
      this.bindKeyboardEvents(); // 监听键盘空格按压状态。
      this.bindResizeObserver(); // 监听窗口尺寸变化以调整 Canvas 大小。
      console.log('[UI] initialized with camera controls'); // 输出初始化完成日志。
      // TODO(R8): 精确世界坐标命中 // 预留后续精确拾取逻辑的注释。
    },

    cacheStatusbarNodes() {
      // 查询并缓存状态栏中的关键节点，避免重复 DOM 查询。
      this.status.zoom = document.getElementById('status-zoom'); // 保存缩放显示节点引用。
      this.status.pos = document.getElementById('status-pos'); // 保存坐标显示节点引用。
    },

    setupToolbar() {
      // 构建工具栏中的按钮并绑定事件。
      const menuGroup = this.elements.toolbar.querySelector('#menu-buttons'); // 获取菜单按钮容器。
      if (menuGroup) {
        // 仅当容器存在时才插入 Grid 开关按钮并保留默认按钮行为。
        const gridButton = document.createElement('button'); // 创建新的按钮元素。
        gridButton.type = 'button'; // 将按钮类型设为普通按钮避免表单行为。
        gridButton.className = 'btn btn-toggle'; // 应用基础按钮样式与网格开关样式。
        gridButton.textContent = 'Grid'; // 设置按钮文本提示功能。
        gridButton.setAttribute('aria-pressed', String(this.renderer.showGrid)); // 使用 aria-pressed 反映当前状态。
        gridButton.addEventListener('click', () => {
          // 绑定点击事件以切换网格可见性。
          const nextState = !this.renderer.showGrid; // 计算下一次网格显示状态。
          this.renderer.setGridVisible(nextState); // 调用渲染器接口切换网格显示。
          gridButton.setAttribute('aria-pressed', String(nextState)); // 同步按钮的 aria 状态。
        });
        menuGroup.appendChild(gridButton); // 将按钮插入工具栏菜单区域。
      }
      const fileButton = this.elements.toolbar.querySelector('button[data-action="file"]'); // 获取文件按钮引用。
      const mapButton = this.elements.toolbar.querySelector('button[data-action="map"]'); // 获取地图按钮引用。
      const packButton = this.elements.toolbar.querySelector('button[data-action="packs"]'); // 获取素材包按钮引用。
      if (fileButton) {
        // 若按钮存在则绑定占位点击事件。
        fileButton.addEventListener('click', () => {
          // 点击后输出占位日志等待后续实现。
          console.log('[UI] 文件菜单点击，占位事件'); // 记录交互以便调试。
        });
      }
      if (mapButton) {
        // 若按钮存在则绑定占位点击事件。
        mapButton.addEventListener('click', () => {
          // 点击后输出占位日志等待后续实现。
          console.log('[UI] 地图菜单点击，占位事件'); // 记录交互以便调试。
        });
      }
      if (packButton) {
        // 若按钮存在则绑定占位点击事件。
        packButton.addEventListener('click', () => {
          // 点击后输出占位日志等待后续实现。
          console.log('[UI] 素材包菜单点击，占位事件'); // 记录交互以便调试。
        });
      }
    },

    setupSidebar() {
      // 设置侧边栏占位内容，保持与上一轮一致。
      const assetGrid = this.elements.sidebar.querySelector('.asset-grid'); // 获取素材网格容器。
      if (assetGrid) {
        // 如果容器存在则确保显示占位元素。
        assetGrid.innerHTML = '<div class="asset-placeholder">素材缩略图区域</div>'; // 填充占位文本，等待后续迭代替换。
      }
    },

    setupStatusbar() {
      // 初始化状态栏文本显示。
      if (this.status.zoom) {
        // 当缩放节点存在时设置默认缩放信息。
        this.status.zoom.textContent = '缩放：100%'; // 初始缩放为 1.0，因此显示 100%。
      }
      if (this.status.pos) {
        // 当坐标节点存在时设置默认坐标信息。
        this.status.pos.textContent = '坐标：-'; // 未在画布内时显示占位符。
      }
    },

    bindCanvasEvents() {
      // 为 Canvas 元素绑定鼠标交互事件。
      const canvas = this.elements.canvas; // 读取 Canvas 引用。
      canvas.addEventListener('wheel', (event) => {
        // 监听滚轮事件以实现缩放。
        event.preventDefault(); // 阻止默认页面滚动，确保缩放行为。
        const delta = event.deltaY < 0 ? 0.1 : -0.1; // 根据滚轮方向确定缩放步进，向上滚动放大。
        const nextZoom = this.renderer.camera.zoom + delta; // 计算目标缩放值。
        const rect = canvas.getBoundingClientRect(); // 获取 Canvas 在视口中的位置。
        const anchorX = event.clientX - rect.left; // 计算鼠标相对 Canvas 的 X 坐标。
        const anchorY = event.clientY - rect.top; // 计算鼠标相对 Canvas 的 Y 坐标。
        this.renderer.setZoom(nextZoom, anchorX, anchorY); // 调用渲染器执行以鼠标为锚点的缩放。
        this.updateZoomStatus(); // 更新状态栏中的缩放百分比。
      });
      canvas.addEventListener('mousedown', (event) => {
        // 监听鼠标按下事件，判断是否进入平移模式。
        const isMiddle = event.button === 1; // 判断是否为鼠标中键。
        const isSpaceDrag = event.button === 0 && this.editor.state.isSpaceHold; // 判断是否为空格+左键组合。
        if (isMiddle || isSpaceDrag) {
          // 当满足任一条件时进入平移状态。
          event.preventDefault(); // 阻止默认行为避免浏览器特殊处理。
          this.editor.state.isPanning = true; // 将编辑器状态更新为正在平移。
          this.panOrigin.x = event.clientX; // 记录当前指针的屏幕 X 坐标。
          this.panOrigin.y = event.clientY; // 记录当前指针的屏幕 Y 坐标。
          document.body.classList.add('grabbing'); // 给 body 添加 grabbing 类以更新光标样式。
        }
      });
      canvas.addEventListener('mousemove', (event) => {
        // 监听鼠标移动事件，用于更新坐标与执行平移。
        const rect = canvas.getBoundingClientRect(); // 获取 Canvas 的位置与尺寸。
        const screenX = Math.round(event.clientX - rect.left); // 计算鼠标在画布内的整数 X 坐标。
        const screenY = Math.round(event.clientY - rect.top); // 计算鼠标在画布内的整数 Y 坐标。
        this.updatePositionStatus(screenX, screenY); // 更新状态栏中的屏幕坐标显示。
        if (this.editor.state.isPanning) {
          // 若当前处于平移模式则根据位移调整相机。
          const dx = event.clientX - this.panOrigin.x; // 计算相对上一次记录的水平位移。
          const dy = event.clientY - this.panOrigin.y; // 计算相对上一次记录的垂直位移。
          this.renderer.translateCamera(dx, dy); // 调用渲染器根据位移更新相机。
          this.panOrigin.x = event.clientX; // 更新基准点供下一次移动计算增量。
          this.panOrigin.y = event.clientY; // 更新基准点供下一次移动计算增量。
        }
      });
      canvas.addEventListener('mouseup', () => {
        // 当鼠标在 Canvas 上释放时退出平移模式。
        if (this.editor.state.isPanning) {
          // 仅在平移状态时执行退出逻辑。
          this.editor.state.isPanning = false; // 重置平移标记。
          document.body.classList.remove('grabbing'); // 移除 grabbing 类恢复默认光标。
        }
      });
      canvas.addEventListener('mouseleave', () => {
        // 当鼠标离开 Canvas 时重置坐标显示并退出平移。
        this.updatePositionStatus(null, null); // 清空状态栏坐标文案。
        if (this.editor.state.isPanning) {
          // 如果离开时仍在平移，需要强制结束状态。
          this.editor.state.isPanning = false; // 重置平移标记。
          document.body.classList.remove('grabbing'); // 移除 grabbing 类恢复光标。
        }
      });
      window.addEventListener('mouseup', () => {
        // 监听全局鼠标抬起，避免拖拽过程中离开 Canvas 导致卡住。
        if (this.editor.state.isPanning) {
          // 仅在平移状态时执行复位。
          this.editor.state.isPanning = false; // 重置平移标记。
          document.body.classList.remove('grabbing'); // 移除 grabbing 类确保光标恢复。
        }
      });
    },

    bindKeyboardEvents() {
      // 绑定键盘事件以追踪空格键状态。
      window.addEventListener('keydown', (event) => {
        // 监听键盘按下事件。
        if (event.code === 'Space') {
          // 当按下空格键时执行逻辑。
          if (!this.editor.state.isSpaceHold) {
            // 仅在之前未按住的情况下更新状态。
            this.editor.state.isSpaceHold = true; // 标记空格键已按下。
          }
          event.preventDefault(); // 阻止页面滚动行为，保持画布聚焦。
        }
      });
      window.addEventListener('keyup', (event) => {
        // 监听键盘松开事件。
        if (event.code === 'Space') {
          // 当松开空格键时重置状态。
          this.editor.state.isSpaceHold = false; // 重置空格按压标记。
        }
      });
    },

    bindResizeObserver() {
      // 绑定窗口尺寸变化事件以适配 Canvas。
      window.addEventListener('resize', () => {
        // 监听浏览器窗口调整大小。
        this.renderer.resizeToContainer(); // 调整 Canvas 尺寸以匹配父容器。
      });
    },

    updateZoomStatus() {
      // 将当前缩放倍率同步到状态栏。
      if (!this.status.zoom) {
        // 若未找到状态栏节点则无需更新。
        return; // 结束方法。
      }
      const percentage = Math.round(this.renderer.camera.zoom * 100); // 将缩放倍率转换为百分比并四舍五入。
      this.status.zoom.textContent = `缩放：${percentage}%`; // 更新状态栏文案显示当前缩放。
    },

    updatePositionStatus(screenX, screenY) {
      // 更新状态栏中的鼠标屏幕坐标。
      if (!this.status.pos) {
        // 若坐标节点缺失则直接返回。
        return; // 结束方法。
      }
      if (typeof screenX === 'number' && typeof screenY === 'number') {
        // 当传入有效坐标时展示具体数值。
        this.status.pos.textContent = `坐标：${screenX}, ${screenY}`; // 显示当前鼠标的屏幕坐标。
      } else {
        // 否则展示占位符表示无有效坐标。
        this.status.pos.textContent = '坐标：-'; // 恢复默认占位文本。
      }
    },
  };

  window.RPG = window.RPG || {}; // 确保全局命名空间存在，避免覆盖其他模块。
  window.RPG.UI = UI; // 将 UI 模块挂载到全局命名空间供 main.js 调用。
})();
