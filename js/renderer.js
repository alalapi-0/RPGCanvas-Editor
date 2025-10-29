/* =============================================
 * 模块：Renderer 渲染器骨架
 * 描述：管理 Canvas 绘制上下文、网格与相机占位实现
 * 说明：首轮仅做初始化与占位功能，后续轮次扩展实际渲染
 * ============================================= */

(function () {
  // 使用立即执行函数创建私有作用域，避免污染全局。
  const Renderer = {
    // 定义 Renderer 对象，提供渲染相关接口。
    canvas: null, // 保存 Canvas 元素引用，供后续绘制使用。
    ctx: null, // 保存 Canvas 2D 上下文引用，以便执行绘制命令。
    tileSize: 48, // 设定单元格尺寸为 48 像素，对应硬性约束。
    camera: { x: 0, y: 0, zoom: 1 }, // 初始化相机参数，后续用于视角控制。

    init(canvasElement) {
      // 初始化方法，接收 Canvas 元素引用。
      if (!(canvasElement instanceof HTMLCanvasElement)) {
        // 校验传入对象必须为 Canvas，避免后续调用出错。
        throw new Error('Renderer.init 需要 HTMLCanvasElement'); // 不符合条件时抛出错误以便开发期发现问题。
      }
      this.canvas = canvasElement; // 保存传入的 Canvas 引用。
      this.ctx = this.canvas.getContext('2d'); // 获取 2D 上下文供绘制使用。
      if (!this.ctx) {
        // 检查是否成功获取上下文。
        throw new Error('无法获取 CanvasRenderingContext2D'); // 若失败则抛出错误提示。
      }
      this.clear(); // 初始化时清空画布，确保画面为默认状态。
      this.drawGrid(true); // 绘制一次网格，便于确认画布区域。
      console.log('[Renderer] init with canvas', this.canvas.width, this.canvas.height); // 输出初始化信息以便调试。
    },

    clear() {
      // 清空画布方法。
      if (!this.ctx) {
        // 若尚未初始化上下文则直接返回。
        console.warn('[Renderer] clear skipped: context not ready'); // 提示未准备好。
        return; // 结束方法。
      }
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); // 清除当前画布内容。
      this.ctx.fillStyle = '#2b2b2b'; // 设置填充颜色为深灰，模拟棋盘背景基色。
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); // 填充整个画布背景。
    },

    drawGrid(show = true) {
      // 绘制网格占位方法，默认显示。
      if (!show) {
        // 如果传入参数为 false，则跳过绘制。
        return; // 直接返回。
      }
      if (!this.ctx) {
        // 若上下文未准备好则给出警告。
        console.warn('[Renderer] drawGrid skipped: context not ready'); // 提示问题。
        return; // 结束方法。
      }
      const { width, height } = this.canvas; // 解构画布宽高，减少重复访问。
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'; // 设置网格线颜色为浅色透明。
      this.ctx.lineWidth = 1; // 设置线宽为 1 像素，保持精细。
      for (let x = 0; x <= width; x += this.tileSize) {
        // 循环绘制垂直网格线，步进为单元格大小。
        this.ctx.beginPath(); // 开始新路径。
        this.ctx.moveTo(x, 0); // 将笔触移动到当前列顶部。
        this.ctx.lineTo(x, height); // 绘制到画布底部形成垂直线。
        this.ctx.stroke(); // 渲染当前线条。
      }
      for (let y = 0; y <= height; y += this.tileSize) {
        // 循环绘制水平网格线。
        this.ctx.beginPath(); // 开始新路径。
        this.ctx.moveTo(0, y); // 将笔触移动到当前行左侧。
        this.ctx.lineTo(width, y); // 绘制到画布右侧形成水平线。
        this.ctx.stroke(); // 渲染当前线条。
      }
    },
  };

  window.RPG = window.RPG || {}; // 确保全局命名空间存在，避免覆盖已有对象。
  window.RPG.Renderer = Renderer; // 将 Renderer 挂载到全局命名空间供其他模块使用。
})();
