# UI/UX 问题与处理结果

## 已处理

1. **整体层级偏平**：区分导航、页面介绍、排课编辑器和地图预览的视觉层级；减少首屏装饰占高，明确卡片边界和操作主次。
2. **窄屏标识重叠**：period 数字与颜色条不再争用狭窄列；手机布局隐藏重复的 `PERIOD` 字样，并在 402、375、360、320px 宽度检查无横向溢出。
3. **iPhone 独立 Web App 配置**：增加 standalone manifest、iOS 主屏幕元数据、安全区留白和图标。完成 iPhone 17 常见逻辑宽度的浏览器视口检查；真机安装验证待 iPhone 空闲并可连接后完成。
4. **Room 列表的 `RXXX`**：现场核实后将原 upper K6（R069）并入 K5（R068），只保留 lower K6（R070）供选择；旧分享链接中的 R069 仍解析到 K5。
5. **导航**：手机端滚动时固定在顶部；页面内容不淡入淡出，只平滑移动一个当前项背景指示器；已按要求移除切页时露出的 Skip to content 标识。
6. **低频功能**：Share Link、Saved schedules、Load Example、Clear Schedule 收进右上角 More；统一摘要高度和 CSS 箭头。
7. **文案**：移除含义不明的 “Your campus. Your way.” 等宣传/占位文字。
8. **数据驱动**：period 行由 React 组件依据周期数据生成；room 和 building 选项从 `/api/rooms` 读取，颜色、楼栋推断、恢复草稿和模板仍共用同一份排课状态。
9. **assert 的用途**：确认这些断言来自 Node 测试文件，用于验证输入解析、地图渲染、API 和前端状态；未删掉有效回归检查，并在 README 中说明它们不是运行时断言。
10. **复用成熟库**：前端已统一为 React + Vite 单页应用；Web Awesome 提供选择控件和提示，Panzoom 负责地图手势。
11. **Skip to content**：已从首页和撤离页移除该可见入口及其样式，避免切页时出现在页面顶部。
12. **撤离地图提示**：移除顶部介绍块、可见地图操作说明和图下免责声明；标题旁的小号 `(i)` 打开帮助弹窗，集中显示地图图例和原有免责声明。
13. **Room Groups by Color**：放进 `(i)` 弹窗，以文字和颜色样本一起说明，不占用地图页面的首屏空间。
14. **Hero 背景**：首页标题区已整体删除，曲线 SVG 随该区域一起移除。
15. **成功提示**：保存/加载模板、分享等操作用视口内短暂提示，避开手机顶部导航；仍用 `role="status"`，不打断焦点。
16. **Map Preview**：生成后打开带遮罩的居中大对话框；桌面大图预览，手机使用可横向查看的放大地图，并保留关闭按钮与下载。
17. **多余文案**：删除 “Enter a room — we’ll find its building for you.”。
18. **页面切换**：关闭整页淡入淡出，只保留单一导航活动底色的平滑移动；移除会在切页时露出的 Skip to content。
19. **撤离地图查看**：参照 GunnWATT 的缩略图打开大图层流程，使用 Panzoom 支持拖动、滚轮和触屏缩放；删除旧 Zoom in/out、Fit map 控件。
20. **地图圆点提示**：每个房间圆点用 Web Awesome Tooltip 显示周期和房间（同一房间多周期分行），移除浏览器原生 `title` 提示。
21. **选择控件**：排课楼栋、已保存计划使用 Web Awesome Select，颜色使用 Web Awesome Color Picker，并统一深色主题和控件样式。
22. **GunnWATT 代码参考**：核对官方 GitHub 的 `Map.tsx`、`ImageBox.tsx`、`ImageMap.tsx`；复用其缩略图到全屏查看流程，手势用小型现成库处理。
23. **首页标题区**：删除 “GUNN HIGH SCHOOL SCHEDULE MAP”、“Your schedule, on the map.” 和说明句，直接显示排课面板。
24. **地图重复提示**：移除重复房间的颜色分割提示及地图下方 P1–P7 标签；周期和房间信息仍由地图圆点 tooltip 展示。
25. **撤离地图大图**：Open Full Size 与地图缩略图都在当前页面打开同一个可缩放对话框，并可用右上角 × 关闭；不再新开标签页。Panzoom 先按查看区域 fit，再允许放大并限制拖动范围。
26. **页面回跳位移**：禁用跨页过渡的 root 动画，保留导航活动指示条的平滑移动。
27. **全图链接**：移除 “View full evacuation map” 的新标签属性，点击后在当前标签导航到撤离地图；生成后的 “Your campus map” 已确认仍是当前页上的对话框。

## 尚待真机确认

- iPhone Mirroring 检测到已配对的 iPhone 17，但设备当前显示 “iPhone in Use”。开发服务器目前只监听 `127.0.0.1`；真机 standalone 验证还需要 iPhone 空闲，并提供手机可访问的 HTTPS 开发地址。本轮完成响应式视口检查，未安装到主屏幕或验证 standalone 实机行为。
