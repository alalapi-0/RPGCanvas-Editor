/* =============================================
 * 模块：AutoTile16 四向掩码拼接工具
 * 描述：根据四方向邻接掩码选择 32×32 A1 子片并在 48×48 格内拼合四个 16×16 象限
 * 说明：第 8 轮交付，提供简化版 16 掩码查表与可覆写的角色映射
 * ============================================= */

(function () {
  // 使用立即执行函数创建私有作用域，避免内部变量泄漏到全局命名空间。
  const CELL_SIZE = 32; // 定义 A1 子片的基础宽高 32 像素，方便后续计算偏移。
  const QUAD_SIZE = 16; // 定义输出象限的目标尺寸 16 像素，实现 32→16 缩放。
  const GROUP_COLS = 2; // 定义 A1 大组横向包含 2 个子片，用于计算组内偏移。
  const GROUP_ROWS = 3; // 定义 A1 大组纵向包含 3 个子片，用于计算组内偏移。
  const GROUP_WIDTH = GROUP_COLS * CELL_SIZE; // 根据列数计算大组宽度 64 像素。
  const GROUP_HEIGHT = GROUP_ROWS * CELL_SIZE; // 根据行数计算大组高度 96 像素。

  const ROLE_ROTATION = {
    // 定义各角色在未额外旋转时的基础角度，用于在 compose 中统一处理。
    FILL: 0, // 填充块无需旋转。
    EDGE_T: 0, // 顶部边默认方向。
    EDGE_R: 90, // 右侧边在基块基础上顺时针旋转 90 度。
    EDGE_B: 180, // 底部边需要旋转 180 度。
    EDGE_L: 270, // 左侧边需要旋转 270 度。
    CORNER_OUT_TL: 0, // 左上外角默认方向。
    CORNER_OUT_TR: 90, // 右上外角旋转 90 度。
    CORNER_OUT_BR: 180, // 右下外角旋转 180 度。
    CORNER_OUT_BL: 270, // 左下外角旋转 270 度。
  }; // 结束角色旋转映射定义。

  const DEFAULT_ROLE_CELLS = {
    // 定义默认角色映射表，将角色映射到 A1 大组内的 (cx, cy)。
    FILL: [1, 1], // 使用大组中心子片作为填充基准。
    EDGE_T: [1, 0], // 使用右上角子片作为边的基准，通过旋转覆盖四个方向。
    EDGE_R: [1, 0], // 与 EDGE_T 共用基准，旋转处理方向。
    EDGE_B: [1, 0], // 与 EDGE_T 共用基准，旋转处理方向。
    EDGE_L: [1, 0], // 与 EDGE_T 共用基准，旋转处理方向。
    CORNER_OUT_TL: [0, 0], // 使用左上子片作为外角基准，通过旋转覆盖四角。
    CORNER_OUT_TR: [0, 0], // 与 CORNER_OUT_TL 共用基准。
    CORNER_OUT_BR: [0, 0], // 与 CORNER_OUT_TL 共用基准。
    CORNER_OUT_BL: [0, 0], // 与 CORNER_OUT_TL 共用基准。
  }; // 结束默认角色映射定义。

  const TABLE = {
    // 定义 16 种掩码到象限角色的查表结果，便于调试与覆盖。
    0x0: {
      // 无相邻：四象限全部使用外角，形成孤岛。
      NW: ['CORNER_OUT_TL', 0], // 左上使用左上外角。
      NE: ['CORNER_OUT_TR', 0], // 右上使用右上外角。
      SE: ['CORNER_OUT_BR', 0], // 右下使用右下外角。
      SW: ['CORNER_OUT_BL', 0], // 左下使用左下外角。
    },
    0x1: {
      // 仅北侧存在相邻：顶部连通，左右与南侧缺失。
      NW: ['EDGE_L', 0], // 左上对缺失的西侧绘制竖边。
      NE: ['FILL', 0], // 右上与北侧相连，使用填充。
      SE: ['EDGE_B', 0], // 右下对缺失的南侧绘制底边。
      SW: ['CORNER_OUT_BL', 0], // 左下同时缺少南与西，使用左下外角。
    },
    0x2: {
      // 仅东侧存在相邻：右侧连通，其余缺失。
      NW: ['CORNER_OUT_TL', 0], // 左上缺少北与西，使用左上外角。
      NE: ['EDGE_T', 0], // 右上缺少北侧，绘制顶边。
      SE: ['FILL', 0], // 右下与东侧相连，使用填充。
      SW: ['EDGE_L', 0], // 左下缺少西侧，绘制左边。
    },
    0x3: {
      // 北与东相邻：右上形成内连通，其余两侧缺失。
      NW: ['EDGE_L', 0], // 左上缺失西侧，绘制竖边。
      NE: ['FILL', 0], // 右上两侧均相邻，使用填充。
      SE: ['EDGE_B', 0], // 右下缺少南侧，绘制底边。
      SW: ['CORNER_OUT_BL', 0], // 左下缺少南与西，使用左下外角。
    },
    0x4: {
      // 仅南侧存在相邻：底部连通，上部缺失。
      NW: ['EDGE_T', 0], // 左上缺少北侧，绘制顶边。
      NE: ['EDGE_T', 0], // 右上缺少北侧，绘制顶边。
      SE: ['FILL', 0], // 右下与南侧连通，使用填充。
      SW: ['FILL', 0], // 左下与南侧连通，使用填充。
    },
    0x5: {
      // 南与北相邻：上下连通，左右缺失。
      NW: ['EDGE_L', 0], // 左上缺少西侧，绘制左边。
      NE: ['EDGE_R', 0], // 右上缺少东侧，绘制右边。
      SE: ['EDGE_R', 0], // 右下缺少东侧，绘制右边。
      SW: ['EDGE_L', 0], // 左下缺少西侧，绘制左边。
    },
    0x6: {
      // 南与东相邻：右下连通，其余缺失。
      NW: ['CORNER_OUT_TL', 0], // 左上缺少北与西，使用外角。
      NE: ['EDGE_T', 0], // 右上缺少北侧，绘制顶边。
      SE: ['FILL', 0], // 右下连通，使用填充。
      SW: ['EDGE_L', 0], // 左下缺少西侧，绘制左边。
    },
    0x7: {
      // 北、东、南相邻：仅西侧缺失。
      NW: ['EDGE_L', 0], // 左上对缺失的西侧绘制左边。
      NE: ['FILL', 0], // 右上完全连通，使用填充。
      SE: ['FILL', 0], // 右下完全连通，使用填充。
      SW: ['EDGE_L', 0], // 左下对缺失的西侧绘制左边。
    },
    0x8: {
      // 仅西侧存在相邻：左侧连通，其余缺失。
      NW: ['FILL', 0], // 左上与西侧连通，使用填充。
      NE: ['EDGE_T', 0], // 右上缺少北侧，绘制顶边。
      SE: ['CORNER_OUT_BR', 0], // 右下缺少南与东，使用右下外角。
      SW: ['EDGE_B', 0], // 左下缺少南侧，绘制底边。
    },
    0x9: {
      // 西与北相邻：左上连通，右下缺失。
      NW: ['FILL', 0], // 左上完整连通，使用填充。
      NE: ['EDGE_T', 0], // 右上缺少北侧，绘制顶边。
      SE: ['CORNER_OUT_BR', 0], // 右下缺少南与东，使用外角。
      SW: ['EDGE_B', 0], // 左下缺少南侧，绘制底边。
    },
    0xA: {
      // 西与东相邻：左右连通，上下缺失。
      NW: ['EDGE_T', 0], // 左上缺少北侧，绘制顶边。
      NE: ['EDGE_T', 0], // 右上缺少北侧，绘制顶边。
      SE: ['EDGE_B', 0], // 右下缺少南侧，绘制底边。
      SW: ['EDGE_B', 0], // 左下缺少南侧，绘制底边。
    },
    0xB: {
      // 北、西、东相邻：仅南侧缺失。
      NW: ['FILL', 0], // 左上连通，使用填充。
      NE: ['FILL', 0], // 右上连通，使用填充。
      SE: ['EDGE_B', 0], // 右下缺少南侧，绘制底边。
      SW: ['EDGE_B', 0], // 左下缺少南侧，绘制底边。
    },
    0xC: {
      // 西与南相邻：左下连通，其余缺失。
      NW: ['EDGE_T', 0], // 左上缺少北侧，绘制顶边。
      NE: ['CORNER_OUT_TR', 0], // 右上缺少北与东，使用右上外角。
      SE: ['FILL', 0], // 右下连通，使用填充。
      SW: ['EDGE_B', 0], // 左下缺少南侧，绘制底边。
    },
    0xD: {
      // 西、南、北相邻：仅东侧缺失。
      NW: ['FILL', 0], // 左上连通，使用填充。
      NE: ['EDGE_R', 0], // 右上缺少东侧，绘制右边。
      SE: ['EDGE_R', 0], // 右下缺少东侧，绘制右边。
      SW: ['FILL', 0], // 左下连通，使用填充。
    },
    0xE: {
      // 东、南、西相邻：仅北侧缺失。
      NW: ['EDGE_T', 0], // 左上缺少北侧，绘制顶边。
      NE: ['EDGE_T', 0], // 右上缺少北侧，绘制顶边。
      SE: ['FILL', 0], // 右下连通，使用填充。
      SW: ['FILL', 0], // 左下连通，使用填充。
    },
    0xF: {
      // 四向皆邻：整块处于内部，四象限使用填充。
      NW: ['FILL', 0], // 左上填充。
      NE: ['FILL', 0], // 右上填充。
      SE: ['FILL', 0], // 右下填充。
      SW: ['FILL', 0], // 左下填充。
    },
  }; // 结束掩码查表定义。

  function buildQuad(role, rot) {
    // 定义内部辅助函数，将查表返回的数组结构转换为对象形式。
    return { role, rot }; // 返回包含角色与额外旋转角度的对象。
  } // 结束 buildQuad 定义。

  function normalizeMask(mask) {
    // 定义内部辅助函数，将掩码压缩到 0-15 范围内。
    const safe = Number.isInteger(mask) ? mask & 0xF : 0; // 若参数为整数则与 0xF 取位，否则回退到 0。
    return safe; // 返回安全掩码值。
  } // 结束 normalizeMask 定义。

  function cloneQuadEntry(entry) {
    // 定义内部辅助函数，深拷贝查表项以避免外部修改源表。
    return {
      NW: buildQuad(entry.NW[0], entry.NW[1]), // 拷贝左上象限定义。
      NE: buildQuad(entry.NE[0], entry.NE[1]), // 拷贝右上象限定义。
      SE: buildQuad(entry.SE[0], entry.SE[1]), // 拷贝右下象限定义。
      SW: buildQuad(entry.SW[0], entry.SW[1]), // 拷贝左下象限定义。
    }; // 返回全新对象。
  } // 结束 cloneQuadEntry 定义。

  const AutoTile16 = {
    // 定义 AutoTile16 工具对象并导出必要 API。
    roleMapPerPack: {}, // 暴露每个素材包可覆盖的角色映射表，键为素材包名或自定义组 id。

    resolveMask(mask) {
      // 根据四向掩码返回四个象限的角色与附加旋转值。
      const safeMask = normalizeMask(mask); // 将掩码限制在 0-15 范围。
      const entry = TABLE[safeMask] || TABLE[0xF]; // 从查表中读取结果，若缺失则退化为全填充。
      return cloneQuadEntry(entry); // 返回查表项的深拷贝，避免外部改写原表。
    },

    getGroupId(tileDef) {
      // 根据素材定义计算所属的 A1 大组标识。
      if (!tileDef || !tileDef.rect) {
        // 当素材定义不完整时直接返回 null。
        return null; // 回退为空值。
      }
      if (tileDef.rect.width !== CELL_SIZE || tileDef.rect.height !== CELL_SIZE) {
        // 非 32×32 的素材不参与本轮自动拼接。
        return null; // 返回 null 表示不支持。
      }
      const packName = typeof tileDef.pack === 'string' ? tileDef.pack : 'unknown-pack'; // 读取素材包名称或使用兜底值。
      const baseX = Math.floor(tileDef.rect.x / GROUP_WIDTH); // 通过除以组宽计算所在大组的列索引。
      const baseY = Math.floor(tileDef.rect.y / GROUP_HEIGHT); // 通过除以组高计算所在大组的行索引。
      return `${packName}:${baseX}:${baseY}`; // 组合字符串形成稳定的组标识。
    },

    getBaseRect(tileDef) {
      // 根据素材定义计算所在大组的 f=0 基准子片矩形。
      if (!tileDef || !tileDef.rect) {
        // 若素材定义缺失则返回 null。
        return null; // 表示无效输入。
      }
      const originX = Math.floor(tileDef.rect.x / GROUP_WIDTH) * GROUP_WIDTH; // 将 X 向下取整到大组起点。
      const originY = Math.floor(tileDef.rect.y / GROUP_HEIGHT) * GROUP_HEIGHT; // 将 Y 向下取整到大组起点。
      return [originX, originY, CELL_SIZE, CELL_SIZE]; // 返回 [sx, sy, sw, sh] 数组供绘制使用。
    },

    _resolveRoleCell(packName, role) {
      // 内部辅助函数：根据素材包名称与角色返回 (cx, cy)。
      const packMap = this.roleMapPerPack[packName]; // 尝试读取指定包的覆盖映射。
      if (packMap && Array.isArray(packMap[role])) {
        // 若存在覆盖映射并且为数组则直接返回该数组。
        return packMap[role]; // 返回自定义坐标。
      }
      return DEFAULT_ROLE_CELLS[role] || DEFAULT_ROLE_CELLS.FILL; // 否则返回默认映射或兜底的填充坐标。
    },

    composeTileQuad(ctx, image, baseRect, tileDef, role, rot, frameIndex, dx, dy, packName) {
      // 在 48×48 格内的某个象限绘制角色对应的 32×32 子片。
      if (!(ctx instanceof CanvasRenderingContext2D)) {
        // 若上下文非法则直接返回。
        return; // 结束绘制避免抛错。
      }
      if (!(image instanceof HTMLImageElement) || !image.complete || image.naturalWidth === 0) {
        // 若图像尚未加载完成则无法绘制。
        return; // 跳过绘制等待资源就绪。
      }
      if (!Array.isArray(baseRect) || baseRect.length < 4) {
        // 若基准矩形非法则结束绘制。
        return; // 防御性退出。
      }
      const [sxBase, syBase, sw, sh] = baseRect; // 解构基准矩形参数。
      const strideX = tileDef && Number.isInteger(tileDef.animStrideX) && tileDef.animStrideX > 0 ? tileDef.animStrideX : sw; // 计算动画帧间的横向偏移。
      const totalFrameOffset = Number.isInteger(frameIndex) && frameIndex > 0 ? frameIndex * strideX : 0; // 根据帧索引计算总偏移。
      const roleCell = this._resolveRoleCell(packName, role); // 根据角色和包名获取 (cx, cy)。
      const cx = roleCell[0] || 0; // 读取列索引，若不存在则默认为 0。
      const cy = roleCell[1] || 0; // 读取行索引，若不存在则默认为 0。
      let sourceX = sxBase + cx * sw + totalFrameOffset; // 计算源图像的 X 坐标。
      let sourceY = syBase + cy * sh; // 计算源图像的 Y 坐标。
      if (tileDef && Array.isArray(tileDef.animWindowCols) && tileDef.animWindowCols.length > 0 && tileDef.animPairW) {
        // 当素材使用滑窗动画时改用滑窗算法定位源区。
        const cols = tileDef.animWindowCols; // 读取滑窗列序列。
        const animFrames = cols.length; // 计算帧数。
        const safeIndex = animFrames > 0 ? ((frameIndex % animFrames) + animFrames) % animFrames : 0; // 取模限制索引。
        const winStart = Number.isInteger(cols[safeIndex]) ? cols[safeIndex] : 0; // 读取当前滑窗起点列。
        const pairW = Number.isInteger(tileDef.animPairW) && tileDef.animPairW > 0 ? tileDef.animPairW : 1; // 读取两列对宽度。
        const pairOffset = cx % pairW; // 根据角色所在列确定滑窗内的偏移。
        const finalCol = winStart + pairOffset; // 计算最终采样列。
        sourceX = sxBase + finalCol * sw; // 使用滑窗列重算源 X。
        sourceY = syBase + cy * sh; // 行索引仍由角色控制。
      }
      if (sourceX + sw > image.naturalWidth || sourceY + sh > image.naturalHeight) {
        // 防御性检查：若超出图集边界则不绘制。
        return; // 避免抛出异常。
      }
      const baseRotation = ROLE_ROTATION[role] || 0; // 查找角色对应的基础旋转角度。
      const extraRotation = Number.isFinite(rot) ? rot : 0; // 读取查表提供的额外旋转值。
      const finalRotation = ((baseRotation + extraRotation) % 360) * (Math.PI / 180); // 计算最终旋转弧度。
      const centerX = dx + QUAD_SIZE / 2; // 计算象限中心 X。
      const centerY = dy + QUAD_SIZE / 2; // 计算象限中心 Y。
      ctx.save(); // 保存上下文状态以应用局部变换。
      ctx.translate(centerX, centerY); // 将原点移动到象限中心。
      if (finalRotation !== 0) {
        // 当需要旋转时应用旋转。
        ctx.rotate(finalRotation); // 旋转上下文以复用基准子片。
      }
      ctx.imageSmoothingEnabled = false; // 禁用插值以保持像素风格。
      ctx.drawImage(image, sourceX, sourceY, sw, sh, -QUAD_SIZE / 2, -QUAD_SIZE / 2, QUAD_SIZE, QUAD_SIZE); // 绘制子片到目标象限。
      ctx.restore(); // 恢复上下文状态避免影响后续绘制。
    },
  }; // 结束 AutoTile16 对象定义。

  window.RPG = window.RPG || {}; // 确保全局命名空间存在。
  window.RPG.AutoTile16 = AutoTile16; // 将 AutoTile16 工具挂载到全局对象供其他模块调用。
  console.log('[RPGCanvas] R8 autotile16 ready'); // 输出加载完成日志满足验收要求。
})();
