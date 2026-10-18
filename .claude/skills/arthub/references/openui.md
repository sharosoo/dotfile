# OpenUI component reference

Generated from the shared component and tool schemas through src/lib/openui/library.ts. Regenerate with npm run docs:openui. Every fenced example is exercised by the publish-validation tests.

Use an `openui` Markdown fence inside a Markdown document. Use `html render` only when OpenUI cannot express the component.

## Language and validation rules

- OpenUI Lang v0.5 expressions, declared `$variables`, built-in `@` functions, actions, Query and Mutation are supported.
- Each statement assigns an expression to an identifier. Define an explicit `root` whose value is a component. Forward references are supported.
- Arguments are positional in the exact order below. Omit optional arguments at the end; use `null` to skip an optional argument before a later one. Named arguments are invalid.
- Declare every `$variable` before using it (forward declarations are allowed). State may contain JSON scalars, arrays or objects. Undeclared references are rejected.
- Reference every value/component statement from root, state defaults, Query/Mutation arguments/defaults, or Action steps; genuinely orphaned statements are rejected.
- Document components escape literal text. Official TextContent and MarkDownRenderer intentionally support Markdown; raw scripts remain unavailable.
- Expressions support arithmetic (+, -, *, /, %), comparisons (==, !=, >, <, >=, <=), logical operators (&&, ||, !), ternaries, parentheses, member access and array indexing. Member access on arrays plucks a field from every row.
- Props marked `$binding<type>` accept a declared `$variable` for two-way input binding. Other expressions referencing that variable update when the input changes.
- Initial state and Query defaults render on the server. Queries and mutations execute only in the reader browser; no JavaScript leaves initial content visible.
- Invalid syntax, components, functions, tools, props, unresolved references and unsupported assistant actions are rejected at publish with `openui-syntax` findings.

## Component signatures

Arguments marked `?` are optional. Children are literal text or components, not raw HTML or arbitrary objects. `ActionExpression` accepts one supported action or `Action([...])` for ordered actions.

Stack(children: any[], direction?: "vertical" | "horizontal", gap?: "sm" | "md" | "lg") — Arrange children vertically or horizontally.
Grid(children: any[], columns?: 2 | 3 | 4) — Arrange children in equal-width columns.
Card(title?: string, children?: string | any[], icon?: "sun" | "moon" | "cloud" | "cloud-sun" | "cloud-moon" | "cloud-rain" | "cloud-drizzle" | "cloud-snow" | "cloud-lightning" | "cloud-fog" | "wind" | "droplets" | "thermometer" | "umbrella" | "sunrise" | "sunset" | "gauge" | "eye" | "snowflake" | "check" | "x" | "alert-triangle" | "info" | "circle-check" | "clock" | "calendar" | "map-pin" | "globe" | "chart-bar" | "trending-up" | "trending-down" | "zap" | "database" | "server" | "code" | "terminal" | "git-branch" | "package" | "rocket" | "shield" | "lock" | "key" | "user" | "users" | "mail" | "link" | "search" | "settings" | "star" | "heart" | "bookmark" | "file-text" | "folder" | "image" | "play" | "pause" | "refresh-cw" | "download" | "upload" | "plus" | "minus" | "arrow-right" | "arrow-up" | "arrow-down") — Group related content with an optional title and leading icon.
Text(content: string, tone?: "default" | "muted") — Display literal plain text.
Icon(name: "sun" | "moon" | "cloud" | "cloud-sun" | "cloud-moon" | "cloud-rain" | "cloud-drizzle" | "cloud-snow" | "cloud-lightning" | "cloud-fog" | "wind" | "droplets" | "thermometer" | "umbrella" | "sunrise" | "sunset" | "gauge" | "eye" | "snowflake" | "check" | "x" | "alert-triangle" | "info" | "circle-check" | "clock" | "calendar" | "map-pin" | "globe" | "chart-bar" | "trending-up" | "trending-down" | "zap" | "database" | "server" | "code" | "terminal" | "git-branch" | "package" | "rocket" | "shield" | "lock" | "key" | "user" | "users" | "mail" | "link" | "search" | "settings" | "star" | "heart" | "bookmark" | "file-text" | "folder" | "image" | "play" | "pause" | "refresh-cw" | "download" | "upload" | "plus" | "minus" | "arrow-right" | "arrow-up" | "arrow-down", size?: "sm" | "md" | "lg" | "xl", tone?: "neutral" | "positive" | "negative" | "note" | "tip" | "warning" | "danger") — Display a curated Lucide SVG icon. Reactive unknown names render nothing.
Stat(label: string, value: string, delta?: string, tone?: "neutral" | "positive" | "negative", icon?: "sun" | "moon" | "cloud" | "cloud-sun" | "cloud-moon" | "cloud-rain" | "cloud-drizzle" | "cloud-snow" | "cloud-lightning" | "cloud-fog" | "wind" | "droplets" | "thermometer" | "umbrella" | "sunrise" | "sunset" | "gauge" | "eye" | "snowflake" | "check" | "x" | "alert-triangle" | "info" | "circle-check" | "clock" | "calendar" | "map-pin" | "globe" | "chart-bar" | "trending-up" | "trending-down" | "zap" | "database" | "server" | "code" | "terminal" | "git-branch" | "package" | "rocket" | "shield" | "lock" | "key" | "user" | "users" | "mail" | "link" | "search" | "settings" | "star" | "heart" | "bookmark" | "file-text" | "folder" | "image" | "play" | "pause" | "refresh-cw" | "download" | "upload" | "plus" | "minus" | "arrow-right" | "arrow-up" | "arrow-down") — Display a metric and optional change.
Callout(tone: "note" | "tip" | "warning" | "danger", title?: string, body: string, icon?: "sun" | "moon" | "cloud" | "cloud-sun" | "cloud-moon" | "cloud-rain" | "cloud-drizzle" | "cloud-snow" | "cloud-lightning" | "cloud-fog" | "wind" | "droplets" | "thermometer" | "umbrella" | "sunrise" | "sunset" | "gauge" | "eye" | "snowflake" | "check" | "x" | "alert-triangle" | "info" | "circle-check" | "clock" | "calendar" | "map-pin" | "globe" | "chart-bar" | "trending-up" | "trending-down" | "zap" | "database" | "server" | "code" | "terminal" | "git-branch" | "package" | "rocket" | "shield" | "lock" | "key" | "user" | "users" | "mail" | "link" | "search" | "settings" | "star" | "heart" | "bookmark" | "file-text" | "folder" | "image" | "play" | "pause" | "refresh-cw" | "download" | "upload" | "plus" | "minus" | "arrow-right" | "arrow-up" | "arrow-down") — Highlight a note, tip, warning or danger.
Badge(label: string, tone?: "neutral" | "positive" | "negative" | "note" | "tip" | "warning" | "danger", icon?: "sun" | "moon" | "cloud" | "cloud-sun" | "cloud-moon" | "cloud-rain" | "cloud-drizzle" | "cloud-snow" | "cloud-lightning" | "cloud-fog" | "wind" | "droplets" | "thermometer" | "umbrella" | "sunrise" | "sunset" | "gauge" | "eye" | "snowflake" | "check" | "x" | "alert-triangle" | "info" | "circle-check" | "clock" | "calendar" | "map-pin" | "globe" | "chart-bar" | "trending-up" | "trending-down" | "zap" | "database" | "server" | "code" | "terminal" | "git-branch" | "package" | "rocket" | "shield" | "lock" | "key" | "user" | "users" | "mail" | "link" | "search" | "settings" | "star" | "heart" | "bookmark" | "file-text" | "folder" | "image" | "play" | "pause" | "refresh-cw" | "download" | "upload" | "plus" | "minus" | "arrow-right" | "arrow-up" | "arrow-down") — Display a short status label.
KeyValue(items: {key: string, value: string}[]) — Display key/value pairs.
Steps(items: {title: string, body?: string}[]) — Display ordered steps.
Timeline(items: {date: string, title: string, body?: string}[]) — Display dated events in order.
Progress(label: string, value: number, max?: number) — Display progress towards a positive maximum (default 100).
Compare(columns: {title: string, items: string[]}[]) — Compare two to four columns of bullet points.
BarChart(labels: string[], values: number[], unit?: string) — Compare nonnegative values; labels and values must have equal lengths.
Button(label: string, action?: ActionExpression, variant?: "primary" | "secondary" | "danger", icon?: "sun" | "moon" | "cloud" | "cloud-sun" | "cloud-moon" | "cloud-rain" | "cloud-drizzle" | "cloud-snow" | "cloud-lightning" | "cloud-fog" | "wind" | "droplets" | "thermometer" | "umbrella" | "sunrise" | "sunset" | "gauge" | "eye" | "snowflake" | "check" | "x" | "alert-triangle" | "info" | "circle-check" | "clock" | "calendar" | "map-pin" | "globe" | "chart-bar" | "trending-up" | "trending-down" | "zap" | "database" | "server" | "code" | "terminal" | "git-branch" | "package" | "rocket" | "shield" | "lock" | "key" | "user" | "users" | "mail" | "link" | "search" | "settings" | "star" | "heart" | "bookmark" | "file-text" | "folder" | "image" | "play" | "pause" | "refresh-cw" | "download" | "upload" | "plus" | "minus" | "arrow-right" | "arrow-up" | "arrow-down") — Run an action when clicked. Variant defaults to secondary; use primary for the one main action.
Buttons(children: any[]) — Group action buttons.
Form(children: any[], submit?: ActionExpression) — Group inputs; run submit on Enter or a submit button.
Input(name: string, label?: string, placeholder?: string, type?: "text" | "email" | "password" | "number" | "search" | "url" | "tel" | "date", value?: $binding<string>) — A text input; bind value to a $variable for two-way updates.
TextArea(name: string, label?: string, placeholder?: string, value?: $binding<string>) — A multiline text input with reactive value.
Select(name: string, options: (string | {label: string, value: string})[], value?: $binding<string>, label?: string) — Choose one option; optional label is hidden when omitted.
Checkbox(name: string, label: string, value?: $binding<boolean>) — A labelled checkbox with reactive boolean value.
Switch(name: string, label: string, value?: $binding<boolean>) — A labelled boolean switch.
Slider(name: string, min: number, max: number, step?: number, value?: $binding<number>, label?: string) — Choose a number in a range; optional label is hidden when omitted.
Table(columns: (string | {key: string, label: string})[], rows: (Record<string, any> | any[])[]) — Display object rows using string keys or {key, label} columns; array rows also supported.
Tabs(items: {label: string, children: string | any[]}[]) — Switch between labelled panels.
Accordion(items: {label: string, children: string | any[]}[]) — Expandable labelled sections.
Details(label: string, children: string | any[], open?: boolean) — An expandable section.
Link(label: string, url: string) — A safe HTTP(S), mailto, fragment or same-origin link.
OfficialCard(children: (TextContent | MarkDownRenderer | CardHeader | OfficialCallout | TextCallout | CodeBlock | Image | ImageBlock | ImageGallery | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | OfficialBarChart | LineChart | OfficialTable | TagBlock | OfficialForm | OfficialButtons | IconButton | OfficialSteps | InlineHeader | EntityList | EditableTable | SnippetCardBlock | OverviewCardBlock | ContextCardBlock | CompositeCardBlock | VisualCardBlock | OfficialTabs | Carousel | OfficialStack)[], variant?: "card" | "sunk" | "clear", direction?: "row" | "column", gap?: "none" | "xs" | "s" | "m" | "l" | "xl" | "2xl", align?: "start" | "center" | "end" | "stretch" | "baseline", justify?: "start" | "center" | "end" | "between" | "around" | "evenly", wrap?: boolean) — Styled container. variant: "card" (default, elevated) | "sunk" (recessed) | "clear" (transparent). Always full width. Accepts all Stack flex params (default: direction "column"). Cards flex to share space in row/wrap layouts.
CardHeader(title?: string, subtitle?: string) — Header with optional title and subtitle
TextContent(text: string, size?: "small" | "default" | "large" | "small-heavy" | "large-heavy") — Text block. Supports markdown. Optional size: "small" | "default" | "large" | "small-heavy" | "large-heavy".
MarkDownRenderer(textMarkdown: string, variant?: "clear" | "card" | "sunk") — Renders markdown text with optional container variant
OfficialCallout(variant: "info" | "warning" | "error" | "success" | "neutral", title: string, description: string, visible?: $binding<boolean>) — Callout banner. Optional visible is a reactive $boolean — auto-dismisses after 3s by setting $visible to false.
TextCallout(variant?: "neutral" | "info" | "warning" | "success" | "danger", title?: string, description?: string) — Text callout with variant, title, and description
Image(alt: string, src?: string) — Image with alt text and optional URL
ImageBlock(src: string, alt?: string) — Image block with loading state
ImageGallery(images: {src: string, alt?: string, details?: string}[]) — Gallery grid of images with modal preview
CodeBlock(language: string, codeString: string) — Syntax-highlighted code block
InlineHeader(heading: string, description?: string) — Compact section heading with an optional one-line description, for use inside cards.
OfficialTable(columns: Col[]) — Data table — column-oriented. Each Col holds its own data array.
Col(label: string, data: any, type?: "string" | "number" | "action") — Column definition — holds label + data array
EditableTable(name?: string, columns?: {type: "text" | "number" | "date-single" | "select" | "url", key?: string, header?: string, width?: number, options?: {value: string, label: string}[]}[], data?: {id: string, values: (string | number)[]}[]) — Spreadsheet-like table whose cells the user can edit inline (text, number, url, date, select columns); edits are saved back as a form field
OfficialBarChart(labels: string[], series: Series[], variant?: "grouped" | "stacked", xLabel?: string, yLabel?: string, height?: number) — Vertical bars; use for comparing values across categories with one or more series
LineChart(labels: string[], series: Series[], variant?: "linear" | "natural" | "step", xLabel?: string, yLabel?: string, height?: number) — Lines over categories; use for trends and continuous data over time
AreaChart(labels: string[], series: Series[], variant?: "linear" | "natural" | "step", xLabel?: string, yLabel?: string, height?: number) — Filled area under lines; use for cumulative totals or volume trends over time
RadarChart(labels: string[], series: Series[]) — Spider/web chart; use for comparing multiple variables across one or more entities
HorizontalBarChart(labels: string[], series: Series[], variant?: "grouped" | "stacked", xLabel?: string, yLabel?: string) — Horizontal bars; prefer when category labels are long or for ranked lists
Series(category: string, values: number[]) — One data series
PieChart(labels: string[], values: number[], variant?: "pie" | "donut", appearance?: "circular" | "semiCircular") — Circular slices; use plucked arrays: PieChart(data.categories, data.values)
RadialChart(labels: string[], values: number[]) — Radial bars; use plucked arrays: RadialChart(data.categories, data.values)
SingleStackedBarChart(labels: string[], values: number[]) — Single horizontal stacked bar; use plucked arrays: SingleStackedBarChart(data.categories, data.values)
Slice(category: string, value: number) — One slice with label and numeric value
ScatterChart(datasets: ScatterSeries[], xLabel?: string, yLabel?: string) — X/Y scatter plot; use for correlations, distributions, and clustering
ScatterSeries(name: string, points: Point[]) — Named dataset
Point(x: number, y: number, z?: number) — Data point with numeric coordinates
OfficialForm(name: string, buttons: OfficialButtons, fields?: FormControl[]) — Form container with fields and explicit action buttons
FormControl(label: string, input: OfficialInput | OfficialTextArea | OfficialSelect | DatePicker | OfficialSlider | CheckBoxGroup | RadioGroup | Chips | OptionCards, hint?: string) — Field with label, input component, and optional hint text
Label(text: string) — Text label
OfficialInput(name: string, placeholder?: string, type?: "text" | "email" | "password" | "number" | "url", rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<string>) — 
OfficialTextArea(name: string, placeholder?: string, rows?: number, rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<string>) — 
OfficialSelect(name: string, items: SelectItem[], placeholder?: string, rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<string>, size?: "small" | "medium" | "large") — 
SelectItem(value: string, label: string) — Option for Select
DatePicker(name: string, mode?: "single" | "range", rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<any>) — 
OfficialSlider(name: string, variant: "continuous" | "discrete", min: number, max: number, step?: number, defaultValue?: number[], label?: string, rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<number[]>) — Numeric slider input; supports continuous and discrete (stepped) variants
CheckBoxGroup(name: string, items: CheckBoxItem[], rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<Record<string, boolean>>) — 
CheckBoxItem(label: string, description: string, name: string, defaultChecked?: boolean) — 
RadioGroup(name: string, items: RadioItem[], defaultValue?: string, rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<string>) — 
RadioItem(label: string, description: string, value: string) — 
SwitchGroup(name: string, items: SwitchItem[], variant?: "clear" | "card" | "sunk", value?: $binding<Record<string, boolean>>) — Group of switch toggles
SwitchItem(label?: string, description?: string, name: string, defaultChecked?: boolean) — Individual switch toggle
ChipItem(value: string, label: string, icon?: OfficialIcon, disabled?: boolean) — A single selectable chip inside a Chips group, with a value, label and optional icon.
Chips(name: string, type?: "single" | "multiple", items?: ChipItem[], rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, defaultValue?: string | string[]) — A form field of compact selectable chips for choosing one or many short options; the selection is stored under `name`.
OptionCard(value: string, title: string, subtitle?: string, topContent?: OfficialIcon | Image, disabled?: boolean) — A single selectable card inside an OptionCards group, with a value, title, optional subtitle and an optional Icon or Image on top.
OptionCards(name: string, type?: "single" | "multiple", items?: OptionCard[], rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, defaultValue?: string | string[]) — A form field of selectable cards (title, optional subtitle, optional icon or image) laid out in a responsive grid for choosing one or many options; the selection is stored under `name`.
OfficialButton(label: string, action?: ActionExpression, variant?: "primary" | "secondary" | "tertiary", type?: "normal" | "destructive", size?: "extra-small" | "small" | "medium" | "large") — Clickable button
OfficialButtons(buttons: OfficialButton[], direction?: "row" | "column") — Group of Button components. direction: "row" (default) | "column".
IconButton(name: string, icon: OfficialIcon, action?: ActionExpression, variant?: "primary" | "secondary" | "tertiary", size?: "extra-small" | "small" | "medium" | "large", shape?: "square" | "circle") — Icon-only button. name is the accessible label and the action label; icon is an Icon; action fires on click.
OfficialStack(children: any[], direction?: "row" | "column", gap?: "none" | "xs" | "s" | "m" | "l" | "xl" | "2xl", align?: "start" | "center" | "end" | "stretch" | "baseline", justify?: "start" | "center" | "end" | "between" | "around" | "evenly", wrap?: boolean) — Flex container. direction: "row"|"column" (default "column"). gap: "none"|"xs"|"s"|"m"|"l"|"xl"|"2xl" (default "m"). align: "start"|"center"|"end"|"stretch"|"baseline". justify: "start"|"center"|"end"|"between"|"around"|"evenly".
OfficialTabs(items: TabItem[]) — Tabbed container
TabItem(value: string, trigger: string, content: (TextContent | MarkDownRenderer | CardHeader | OfficialCallout | TextCallout | CodeBlock | Image | ImageBlock | ImageGallery | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | OfficialBarChart | LineChart | OfficialTable | TagBlock | OfficialForm | OfficialButtons | IconButton | OfficialSteps | InlineHeader | EntityList | EditableTable | SnippetCardBlock | OverviewCardBlock | ContextCardBlock | CompositeCardBlock | VisualCardBlock)[]) — value is unique id, trigger is tab label, content is array of components
OfficialAccordion(items: AccordionItem[]) — Collapsible sections
AccordionItem(value: string, trigger: string, content: (TextContent | MarkDownRenderer | CardHeader | OfficialCallout | TextCallout | CodeBlock | Image | ImageBlock | ImageGallery | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | OfficialBarChart | LineChart | OfficialTable | TagBlock | OfficialForm | OfficialButtons | IconButton | OfficialSteps | InlineHeader | EntityList | EditableTable | SnippetCardBlock | OverviewCardBlock | ContextCardBlock | CompositeCardBlock | VisualCardBlock)[]) — value is unique id, trigger is section title
OfficialSteps(items: StepsItem[]) — Step-by-step guide
StepsItem(title: string, details: string) — title and details text for one step
Carousel(children: (TextContent | MarkDownRenderer | CardHeader | OfficialCallout | TextCallout | CodeBlock | Image | ImageBlock | ImageGallery | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | OfficialBarChart | LineChart | OfficialTable | TagBlock | OfficialForm | OfficialButtons | IconButton | OfficialSteps | InlineHeader | EntityList | EditableTable | SnippetCardBlock | OverviewCardBlock | ContextCardBlock | CompositeCardBlock | VisualCardBlock)[][], variant?: "card" | "sunk") — Horizontal scrollable carousel
Separator(orientation?: "horizontal" | "vertical", decorative?: boolean) — Visual divider between content sections
TagBlock(tags: string[], size?: "sm" | "md" | "lg") — tags is an array of strings; optional size sm | md | lg
Tag(text: string, icon?: OfficialIcon, size?: "sm" | "md" | "lg", variant?: "neutral" | "info" | "success" | "warning" | "danger") — Styled tag/badge with optional Icon and variant
OfficialIcon(name: string, category?: string) — A lucide icon by kebab-case name (e.g. 'circle-check'). Optional category picks a topical fallback when the name doesn't resolve.
EntityList(rows?: {left: string, right: string, rightVariant?: "text" | "number"}[], size?: "small" | "default", header?: {left: string, right: string, rightVariant?: "text" | "number"}, footer?: {left: string, right: string, rightVariant?: "text" | "number"}) — Two-column key/value rows (left label, right value). size 'default' supports optional header and footer rows; rightVariant 'number' uses tabular numbers.
ListBlock(items: ListItem[], variant?: "number" | "image", size?: "default" | "small") — A list of items with number or image indicators. Each item can optionally have an action. size small renders a compact list.
ListItem(title: string, subtitle?: string, image?: {src: string, alt: string}, actionLabel?: string, action?: ActionExpression) — Item in a ListBlock — displays a title with an optional subtitle and image. When action is provided, the item becomes clickable.
OfficialText(variant?: "text" | "number", value: string, subtext?: string, subtextVariant?: "text" | "number" | "metric", size?: "xs" | "sm" | "md" | "lg") — Plain text line with optional subtext. variant 'number' uses tabular number styling; subtextVariant 'metric' colors a leading +/- subtext green/red.
BoldText(variant?: "text" | "number", value: string, subtext?: string, subtextVariant?: "text" | "number" | "metric", size?: "xs" | "sm" | "md" | "lg") — Emphasized (bold) text line with optional subtext. variant 'number' uses tabular number styling; subtextVariant 'metric' colors a leading +/- subtext green/red.
IconText(icon: OfficialIcon, iconVariant?: "neutral" | "info" | "success" | "warning" | "danger" | "inverted" | "filled" | "soft", iconSize?: "xs" | "s" | "m" | "l" | "xl" | "sm" | "md" | "lg", title: string, subtitle?: string, bold?: boolean, layout?: "horizontal" | "vertical") — An icon badge with a title and optional subtitle, laid out horizontally or vertically. iconVariant sets the badge color.
ImageText(src: string, alt?: string, title: string, subtitle?: string, bold?: boolean, layout?: "horizontal" | "vertical", imageSize?: number) — A small square image (thumbnail/avatar) with a title and optional subtitle. src must be a real image URL.
ImageTextLarge(src: string, alt?: string, title: string, subtitle?: string, bold?: boolean) — A full-width banner image above a bold title and optional subtitle. src must be a real image URL.
MetricIndicatorInline(value: string, subtext?: string, trend?: {direction: "up" | "down", value: number}) — Headline metric value with an optional +/- percentage trend and subtext, all on one line.
MetricIndicatorWithStrikethrough(value: string, subtext?: string, previousValue?: string, trend?: {direction: "up" | "down", value: number}) — Headline metric value with an optional struck-through previousValue, a +/- percentage trend, and subtext below.
SnippetCardItem(id?: string, lhs: IconText | ImageText, rhs?: OfficialText | BoldText) — One row-style snippet card: a label on the left (IconText or ImageText) and an optional value on the right (Text or BoldText).
SnippetCardBlock(items: SnippetCardItem[], layout?: "grid", responsive?: boolean, action?: ActionExpression, gap?: number | string) — A responsive grid of compact label/value cards (2 per row) for showing several short facts side by side; optionally clickable with a shared action.
OverviewCardItem(id?: string, top: IconText | ImageText | OfficialText, bottom?: MetricIndicatorInline) — One overview card: a heading slot at the top (IconText, ImageText or Text) and an optional MetricIndicatorInline at the bottom.
OverviewCardBlock(items: OverviewCardItem[], layout?: "grid" | "carousel", responsive?: boolean, action?: ActionExpression, gap?: number | string) — A grid or horizontal carousel of compact overview cards, each with a heading (icon/image/text) on top and an inline metric below; optionally clickable with a shared action.
ContextCardItem(id?: string, title: string | Tag, body?: string, bgColor?: "gray", bgImageSrc?: string, bgImageAlt?: string) — A single card inside a ContextCardBlock: a title (plain string or Tag), an optional markdown body, and an optional gray tint or background image.
ContextCardBlock(items: ContextCardItem[], layout?: "grid" | "carousel", responsive?: boolean, action?: ActionExpression, gap?: number | string) — A grid or carousel of compact tinted context cards (title or tag plus a short bold body); an optional action makes every card clickable.
CompositeCardItem(id?: string, header?: IconText | ImageText | ImageTextLarge | OfficialText | Image, body?: (OfficialText | BoldText | MetricIndicatorInline | IconText | Image | AreaChart | OfficialBarChart | LineChart | ListBlock | TagBlock | EntityList)[], footer?: {price?: BoldText | MetricIndicatorWithStrikethrough, button?: OfficialButton}) — A single card inside a CompositeCardBlock: an optional header (icon/image/text), a stack of body elements (text, metrics, charts, lists, tags), and an optional price/button footer.
CompositeCardBlock(items: CompositeCardItem[], layout?: "grid" | "carousel", responsive?: boolean, action?: ActionExpression, gap?: number | string) — A two-per-row grid or carousel of rich cards, each with an optional header, stacked body content (text, metrics, charts, lists, tags) and a price/button footer; an optional action makes every card clickable.
VisualCardItem(body: BoldText, id?: string, bgImageSrc?: string, tag?: Tag, bgImageAlt?: string) — A single photo-first card inside a VisualCardBlock: a BoldText body panel, an optional Tag, and a background image (bgImageSrc must be a real URL; bgImageAlt is its alt text).
VisualCardBlock(items: VisualCardItem[], layout?: "grid" | "carousel", responsive?: boolean, action?: ActionExpression, gap?: number | string) — A grid or carousel of photo-first cards: a full-bleed background image with a tag on top and a bold text panel at the bottom; an optional action makes every card clickable.
Modal(title: string, open?: $binding<boolean>, children: (TextContent | MarkDownRenderer | CardHeader | OfficialCallout | TextCallout | CodeBlock | Image | ImageBlock | ImageGallery | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | OfficialBarChart | LineChart | OfficialTable | TagBlock | OfficialForm | OfficialButtons | IconButton | OfficialSteps | InlineHeader | EntityList | EditableTable | SnippetCardBlock | OverviewCardBlock | ContextCardBlock | CompositeCardBlock | VisualCardBlock)[], size?: "sm" | "md" | "lg") — Modal dialog. open is a reactive $boolean binding — set to true to open, X/Escape/backdrop auto-closes. Put Form with buttons inside children.

The library merges all 82 components from `@openuidev/react-ui` with document components. Existing positional signatures remain valid. Official-only names work unchanged. Overlapping names dispatch by argument shape: e.g. `Card([children])` and `Table([Col(...)])` use the official component, while `Card(title, children, icon?)` and `Table(columns, rows)` use document components. The explicit `OfficialName` signatures above select the official variant when an argument list is ambiguous (notably Input/TextArea with only a name and placeholder, or Text). Three-argument `Callout("warning", title, body)` selects the official left-bar warning; pass a fourth icon argument (or null) to select the document warning tone. Official four-argument Callout with a boolean remains the dismissible official component. Server HTML includes controls, values, table rows, the first tab panel, native expandable accordion details, images and chart SVGs. Official components are dynamically imported only when used, with matching component styles preloaded in the document head. Initial markup stays visible until all required renderers are ready for hydration.

Select and Slider labels are optional and never fall back to their internal name. Leading icon arguments on Card, Stat, Callout, Badge and Button are icon-name strings, not nested Icon calls.

Curated document icon names: `sun`, `moon`, `cloud`, `cloud-sun`, `cloud-moon`, `cloud-rain`, `cloud-drizzle`, `cloud-snow`, `cloud-lightning`, `cloud-fog`, `wind`, `droplets`, `thermometer`, `umbrella`, `sunrise`, `sunset`, `gauge`, `eye`, `snowflake`, `check`, `x`, `alert-triangle`, `info`, `circle-check`, `clock`, `calendar`, `map-pin`, `globe`, `chart-bar`, `trending-up`, `trending-down`, `zap`, `database`, `server`, `code`, `terminal`, `git-branch`, `package`, `rocket`, `shield`, `lock`, `key`, `user`, `users`, `mail`, `link`, `search`, `settings`, `star`, `heart`, `bookmark`, `file-text`, `folder`, `image`, `play`, `pause`, `refresh-cw`, `download`, `upload`, `plus`, `minus`, `arrow-right`, `arrow-up`, `arrow-down`. Names may be reactive expressions; literal unknown names are rejected, and unknown runtime names render nothing. Icon(name, size?, tone?) uses sm/md/lg/xl and Badge tones. Official Icon(name, category) remains available for official card-building blocks.

Official icons use the same curated catalog plus category fallback glyphs, not the entire Lucide set. An official icon outside that catalog uses its category fallback. Official charts use document color tokens and follow the document light/dark toggle.

## Built-in functions

@Count(array: any[]) → number — Returns array length
@First(array: any[]) → any — Returns first element of array
@Last(array: any[]) → any — Returns last element of array
@Sum(numbers: number[]) → number — Sum of numeric array
@Avg(numbers: number[]) → number — Average of numeric array
@Min(numbers: number[]) → number — Minimum value in array
@Max(numbers: number[]) → number — Maximum value in array
@Sort(array: any[], field: string, direction?: "asc" | "desc") → any[] — Sort array by field. Direction: "asc" (default) or "desc"
@Filter(array: any[], field: string, operator: "==" | "!=" | ">" | "<" | ">=" | "<=" | "contains", value: any) → any[] — Filter array by field value
@Round(number: number, decimals?: number) → number — Round to N decimal places (default 0)
@Abs(number: number) → number — Absolute value
@Floor(number: number) → number — Round down to nearest integer
@Ceil(number: number) → number — Round up to nearest integer
@Each(array: any[], varName: string, template: any) — Evaluate template for each element. varName is the loop variable — use it ONLY inside the template expression (inline). Do NOT create a separate statement for the template.

`@Each` loop variables exist only inside their inline template expression; do not extract a template using its loop variable into another statement.

## Actions

- `@Set($variable, value)` updates declared state; the value is evaluated when the action runs.
- `@Reset($variable1, $variable2)` restores the listed variables to their declared defaults.
- `@Run(reference)` executes a declared Mutation or refreshes a declared Query.
- `@OpenUrl(url)` opens a safe HTTP(S), mailto, same-origin or fragment URL.
- Custom(name: string, params?: Record<string, any>) — Dispatch an arthub:openui-action browser event with name and params to a host integration.
- Compose ordered actions with `Action([...])`. A failed mutation stops the remaining steps. Reference the composed action from a Button or Form.
- `@ToAssistant` and `continue_conversation` are unavailable and rejected: documents have no assistant. Custom actions only dispatch a bubbling `arthub:openui-action` browser event; a host integration must listen for it.

## Query and Mutation

- `Query(toolName, arguments, defaults?, refreshSeconds?)` is a top-level declaration. It loads on mount and reloads when state used in its arguments changes. Omit defaults for server-rendered skeletons. Browser initial loads and refetches show component-shaped skeletons rather than stale/default data; static content and Card titles remain visible.
- `Mutation(toolName, arguments)` is a top-level declaration. It does not run on load; execute it with `@Run`. Arguments are evaluated with current state when the action runs.
- Mutation results expose `status` (`idle`, `loading`, `success`, `error`), `data` and `error`.
- Use plain identifiers for Query and Mutation declarations, not `$variables`.
- Tools return their JSON value directly, not a wrapper. `store_get` returns `null` for an absent key.
- Store tools persist localStorage values isolated by artifact ID and shared across fences and versions of that artifact. Storage failures are surfaced, not replaced with fabricated data.
- `http_get` accepts HTTPS or same-origin URLs without embedded credentials, rejects redirects, and follows page CSP connect-src. Network, HTTP and JSON failures surface as Query errors.

## Available tools

Pass one arguments object matching the tool schema to Query or Mutation. Only the following tools are available.

- **http_get** — Fetch JSON from HTTPS or a same-origin URL, subject to the document CSP. Returns the JSON body. Failures become Query errors.
  Arguments (JSON Schema): `{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"url":{"type":"string"},"query":{"type":"object","propertyNames":{"type":"string"},"additionalProperties":{"type":["string","number","boolean"]}}},"required":["url"],"additionalProperties":false}`
- **store_get** — Read a document-local persistent value. Returns the stored JSON value, or null when absent.
  Arguments (JSON Schema): `{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"key":{"type":"string","minLength":1}},"required":["key"],"additionalProperties":false}`
- **store_set** — Persist a document-local JSON value and return it.
  Arguments (JSON Schema): `{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"key":{"type":"string","minLength":1},"value":{}},"required":["key","value"],"additionalProperties":false}`
- **store_append** — Append item to a document-local array (initially empty) and return the resulting array.
  Arguments (JSON Schema): `{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"key":{"type":"string","minLength":1},"item":{}},"required":["key","item"],"additionalProperties":false}`
- **store_remove** — Remove an array element at index and return the array; omit index to delete the key and return null.
  Arguments (JSON Schema): `{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"key":{"type":"string","minLength":1},"index":{"type":"integer","minimum":0,"maximum":9007199254740991}},"required":["key"],"additionalProperties":false}`

## Validated examples

Every example below is a complete program validated by the same publish validator as document fences.

### Static layout

```openui
root = Stack([Card("Summary", [Stat("Requests", "1,200", "+8%", "positive"), Text("All systems operational", "muted"), Progress("Complete", 60)]), Grid([Badge("Ready", "positive"), Callout("note", null, "Plain text stays literal.")], 2)])
```

### Interactive filter and derived values

```openui
$filter = ""
root = Stack([Input("filter", "Filter", "Search titles", "search", $filter), Text("Count: " + @Count(filtered)), Table(["title", "amount"], filtered), Stack(@Each(filtered, "row", Text(row.title)))])
filtered = @Filter(rows, "title", "contains", $filter)
rows = [{title: "Alpha", amount: 2}, {title: "Beta", amount: 3}]
```

### Forms and reactive controls

```openui
$name = ""
$note = ""
$role = "engineer"
$notify = true
$enabled = false
$level = 5
root = Form([Input("name", "Name", "Your name", "text", $name), TextArea("note", "Note", "Optional note", $note), Select("role", [{label: "Engineer", value: "engineer"}, {label: "Designer", value: "designer"}], $role), Checkbox("notify", "Notify me", $notify), Switch("enabled", "Enabled", $enabled), Slider("level", 0, 10, 1, $level), Text("Hello " + $name), Button("Reset", reset)], reset)
reset = @Reset($name, $note, $role, $notify, $enabled, $level)
```

### Persistent list: mutation, refresh and reset

```openui
$title = ""
$filter = ""
root = Stack([Input("title", "New item", null, "text", $title), Input("filter", "Filter", null, "search", $filter), Buttons([Button("Add", Action([@Run(save), @Run(items), @Reset($title)]), "primary"), Button("Clear filter", @Set($filter, ""), "secondary")]), Table(["title"], @Filter(items, "title", "contains", $filter)), Text("Save status: " + save.status)])
items = Query("store_get", {key: "items"}, [])
save = Mutation("store_append", {key: "items", item: {title: $title}})
```

### Fetch JSON

```openui
root = Stack([Text(packageInfo.name), Button("Refresh", @Run(packageInfo))])
packageInfo = Query("http_get", {url: "https://cdn.jsdelivr.net/npm/@openuidev/react-lang@1.0.1/package.json"}, {name: "Loading package metadata"})
```

### Tabs and expandable content

```openui
root = Tabs([{label: "Overview", children: [Text("Overview"), Details("More", "Expanded detail")]}, {label: "Reference", children: [Accordion([{label: "First", children: [Text("First detail")]}, {label: "Second", children: "Second detail"}])]}])
```

### Navigation and host actions

```openui
root = Buttons([Link("Documentation", "https://openui.com/docs/openui-lang"), Button("Open documentation", @OpenUrl("https://openui.com/docs/openui-lang")), Button("Notify host", @Custom("notify", {message: "Hello"}))])
```

### Weather with reactive icons and loading skeletons

```openui
$city = "Seoul"
lat = $city == "Seoul" ? 37.57 : 35.68
lon = $city == "Seoul" ? 126.98 : 139.69
wx = Query("http_get", {url: "https://api.open-meteo.com/v1/forecast", query: {latitude: lat, longitude: lon, current: "temperature_2m,weather_code,wind_speed_10m"}})
root = Stack([Select("city", ["Seoul", "Tokyo"], $city, "City"), Card("Current weather", [Icon(wx.current.weather_code == 0 ? "sun" : "cloud", "xl", "note"), Stat("Temperature", wx.current.temperature_2m + " °C", null, "neutral", "thermometer"), Stat("Wind", wx.current.wind_speed_10m + " km/h", null, "neutral", "wind")], "map-pin"), Text("Weather data from Open-Meteo"), Button("Refresh", @Run(wx), "secondary", "refresh-cw")])
```

### Official charts, column tables and form controls

```openui
$country = "us"
root = Card([CardHeader("Official OpenUI"), TextContent("Charts, tables and forms share the document theme."), BarChart(["Mon", "Tue"], [Series("Visits", [12, 18])]), Table([Col("Day", ["Mon", "Tue"]), Col("Visits", [12, 18], "number")]), Form("preferences", Buttons([Button("Save", @Custom("save", {country: $country}), "primary")]), [FormControl("Country", Select("country", [SelectItem("us", "United States"), SelectItem("kr", "South Korea")], "Choose a country", null, $country))])])
```
