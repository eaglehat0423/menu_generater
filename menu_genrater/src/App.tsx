import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import { domToPng } from 'modern-screenshot'
import './App.css'

const TAX_RATE = 0.1
const PAGE_WIDTH = 794
const PAGE_HEIGHT = 1123
const DEFAULT_SHADOW_COLOR = '#57e8ff'
const COLOR_HISTORY_KEY = 'menu_generator_shadow_history'
const MAX_COLOR_HISTORY = 8

type MenuItem = {
  id: string
  name: string
  price: string
}

type ComputedMenuItem = MenuItem & {
  priceValue: number
  taxIncluded: number
}

const initialItems: MenuItem[] = [
  { id: 'item-1', name: 'メニュー１', price: '980' },
  { id: 'item-2', name: 'メニュー２', price: '888' },
]

const sanitizeDigits = (value: string) => value.replace(/[^\d]/g, '')

const formatPrice = (value: number) => (value > 0 ? String(value) : '')

const getTaxIncluded = (value: number) =>
  value > 0 ? Math.round(value * (1 + TAX_RATE)) : 0

type AutoFitOptions = {
  min?: number
  max?: number
}

const useAutoFitText = (
  textRef: React.RefObject<HTMLElement | null>,
  text: string,
  { min = 48, max = 220 }: AutoFitOptions = {},
) => {
  const fit = useCallback(() => {
    const node = textRef.current
    if (!node) return
    const parent = node.parentElement
    if (!parent) return

    const parentStyle = getComputedStyle(parent)
    const paddingTop = parseFloat(parentStyle.paddingTop || '0')
    const paddingBottom = parseFloat(parentStyle.paddingBottom || '0')
    const availableHeight = parent.clientHeight - (paddingTop + paddingBottom)
    if (!availableHeight || availableHeight <= 0) return

    let low = min
    let high = max
    let best = min

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      node.style.fontSize = `${mid}px`
      if (node.scrollHeight <= availableHeight) {
        best = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    node.style.fontSize = `${best}px`
  }, [textRef, min, max])

  useLayoutEffect(() => {
    fit()
  }, [fit, text])

  useEffect(() => {
    const parent = textRef.current?.parentElement
    if (!parent) return
    const observer = new ResizeObserver(() => fit())
    observer.observe(parent)

    const handleResize = () => fit()
    window.addEventListener('resize', handleResize)

    const fontReady = (document as Document & { fonts?: FontFaceSet }).fonts
    fontReady?.ready.then(() => fit())

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', handleResize)
    }
  }, [fit, textRef])
}

type MenuPreviewProps = {
  item: ComputedMenuItem
  shadowColor: string
}

const MenuPreview = ({ item, shadowColor }: MenuPreviewProps) => {
  const nameRef = useRef<HTMLDivElement>(null)
  useAutoFitText(nameRef, item.name || '　')

  return (
    <article
      className="menu-item"
      style={{ '--shadow-color': shadowColor } as CSSProperties}
    >
      <div className="menu-item__name-box">
        <div ref={nameRef} className="menu-item__name">
          {item.name || '　'}
        </div>
      </div>
      <div className="menu-item__price" aria-label="価格情報">
        <span className="menu-item__price-main">
          {item.priceValue ? `${formatPrice(item.priceValue)}円` : '価格未定'}
        </span>
        {item.priceValue ? (
          <span className="menu-item__price-tax">
            （税込{formatPrice(item.taxIncluded)}円）
          </span>
        ) : null}
      </div>
    </article>
  )
}

const loadColorHistory = (): string[] => {
  if (typeof window === 'undefined') return [DEFAULT_SHADOW_COLOR]
  try {
    const stored = window.localStorage.getItem(COLOR_HISTORY_KEY)
    if (!stored) return [DEFAULT_SHADOW_COLOR]
    const parsed = JSON.parse(stored) as string[]
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.filter((color) => typeof color === 'string')
    }
    return [DEFAULT_SHADOW_COLOR]
  } catch (error) {
    console.warn('Failed to load color history', error)
    return [DEFAULT_SHADOW_COLOR]
  }
}

function App() {
  const initialColorHistory = useMemo(() => loadColorHistory(), [])
  const [colorHistory, setColorHistory] = useState<string[]>(initialColorHistory)
  const [shadowColor, setShadowColor] = useState(initialColorHistory[0] ?? DEFAULT_SHADOW_COLOR)
  const [items, setItems] = useState<MenuItem[]>(initialItems)
  const [visibleCount, setVisibleCount] = useState<1 | 2>(2)
  const [pageScale, setPageScale] = useState(1)
  const previewRef = useRef<HTMLDivElement>(null)
  const previewStageRef = useRef<HTMLDivElement>(null)
  const historyTimeoutRef = useRef<number | null>(null)

  const computedItems = useMemo<ComputedMenuItem[]>(
    () =>
      items.map((item) => {
        const priceValue = Number(sanitizeDigits(item.price)) || 0
        return {
          ...item,
          priceValue,
          taxIncluded: getTaxIncluded(priceValue),
        }
      }),
    [items],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(COLOR_HISTORY_KEY, JSON.stringify(colorHistory))
  }, [colorHistory])

  const commitColorToHistory = useCallback(
    (nextColor: string) => {
      setColorHistory((prev) => {
        const filtered = prev.filter((color) => color !== nextColor)
        return [nextColor, ...filtered].slice(0, MAX_COLOR_HISTORY)
      })
    },
    [setColorHistory],
  )

  const scheduleHistoryUpdate = useCallback(
    (nextColor: string) => {
      if (historyTimeoutRef.current) {
        window.clearTimeout(historyTimeoutRef.current)
      }
      historyTimeoutRef.current = window.setTimeout(() => {
        commitColorToHistory(nextColor)
        historyTimeoutRef.current = null
      }, 500)
    },
    [commitColorToHistory],
  )

  const handleShadowColorChange = (
    nextColor: string,
    { immediate = true }: { immediate?: boolean } = {},
  ) => {
    setShadowColor(nextColor)
    if (immediate) {
      if (historyTimeoutRef.current) {
        window.clearTimeout(historyTimeoutRef.current)
        historyTimeoutRef.current = null
      }
      commitColorToHistory(nextColor)
      return
    }
    scheduleHistoryUpdate(nextColor)
  }

  const flushPendingColor = useCallback(() => {
    if (historyTimeoutRef.current) {
      window.clearTimeout(historyTimeoutRef.current)
      historyTimeoutRef.current = null
    }
    commitColorToHistory(shadowColor)
  }, [commitColorToHistory, shadowColor])

  useEffect(() => {
    return () => {
      if (historyTimeoutRef.current) {
        window.clearTimeout(historyTimeoutRef.current)
      }
    }
  }, [])

  const handleNameChange =
    (id: string) => (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, name: value } : item)),
      )
    }

  const handlePriceChange =
    (id: string) => (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target
      const digitsOnly = sanitizeDigits(value)
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, price: digitsOnly } : item)),
      )
    }

  const updateScale = useCallback(() => {
    const stage = previewStageRef.current
    const page = previewRef.current
    if (!stage || !page) return

    const styles = getComputedStyle(stage)
    const paddingX =
      parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight)
    const paddingY =
      parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom)
    const availableWidth = Math.max(0, stage.clientWidth - paddingX)
    const availableHeight = Math.max(0, stage.clientHeight - paddingY)
    const widthRatio = availableWidth / PAGE_WIDTH
    const heightRatio = availableHeight / PAGE_HEIGHT
    const nextScale = Math.min(1, widthRatio, heightRatio)

    if (Number.isFinite(nextScale) && nextScale > 0) {
      setPageScale(nextScale)
    } else {
      setPageScale(1)
    }
  }, [])

  useLayoutEffect(() => {
    updateScale()
    const stage = previewStageRef.current
    const page = previewRef.current
    if (!stage || !page) return

    const stageObserver = new ResizeObserver(() => updateScale())
    const pageObserver = new ResizeObserver(() => updateScale())
    stageObserver.observe(stage)
    pageObserver.observe(page)
    window.addEventListener('resize', updateScale)

    return () => {
      stageObserver.disconnect()
      pageObserver.disconnect()
      window.removeEventListener('resize', updateScale)
    }
  }, [updateScale])

  const handleDownload = async () => {
    const node = previewRef.current;
    if (!node) return;

    // 1. 現在のスタイルを保存
    const originalStyle = node.style.cssText;

    try {
      // 2. 撮影用のスタイル設定
      // visibility: hidden は使わず、opacity: 0 か z-index で隠すのがコツです
      node.style.transition = "none";
      node.style.transform = "none";
      node.style.position = "fixed";
      node.style.top = "0";
      node.style.left = "0";
      node.style.width = `${PAGE_WIDTH}px`;
      node.style.height = `${PAGE_HEIGHT}px`;
      node.style.zIndex = "9999"; // 最前面へ
      node.style.backgroundColor = "#ffffff";

      // 文字サイズの再計算を確実に行わせるためのリフロー強制
      node.getBoundingClientRect();

      // 3. ブラウザが描画を完了するまで僅かに待機
      await new Promise((r) => setTimeout(r, 100));

      const dataUrl = await domToPng(node, {
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        scale: 2,
        backgroundColor: "#ffffff",
      });

      const timestamp = new Date()
        .toISOString()
        .replace(/[-:T]/g, "")
        .slice(0, 12);
      const link = document.createElement("a");
      link.download = `menu_${timestamp}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Download Error:", error);
      alert("PNGの書き出しに失敗しました。");
    } finally {
      // 4. スタイルを元に戻す
      node.style.cssText = originalStyle;
    }
  };

  const itemsToRender = computedItems.slice(0, visibleCount)

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">A4和風メニュー・ジェネレーター</p>
          <h1>縦書きポップを即座に生成</h1>
        </div>
        <p className="header-note">
          商品名と価格を入力し、一枚あたり１つまたは２つのメニュー構成を選べます。仕上がりはPNGでダウンロード可能です。
        </p>
      </header>

      <main className="app-layout">
        <section className="control-panel" aria-label="設定フォーム">
          <div className="control-row">
            <span className="control-label">掲載数</span>
            <div className="segment-control">
              {[1, 2].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={count === visibleCount ? 'active' : ''}
                  onClick={() => setVisibleCount(count as 1 | 2)}
                >
                  {count}品
                </button>
              ))}
            </div>
          </div>

          <label className="control-row color-row">
            <span className="control-label">影の色</span>
            <input
              type="color"
              value={shadowColor}
              onChange={(event) =>
                handleShadowColorChange(event.target.value, { immediate: false })
              }
              onBlur={flushPendingColor}
              aria-label="影の色を選択"
            />
          </label>
          {colorHistory.length > 1 ? (
            <div className="color-history" aria-label="過去に使った色">
              <span>最近使った色</span>
              <div className="color-history__list">
                {colorHistory.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-chip ${color === shadowColor ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleShadowColorChange(color)}
                    aria-label={`色 ${color}`}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {items.map((item, index) => (
            <fieldset key={item.id} className="item-form">
              <legend>メニュー {index + 1}</legend>
              <label>
                <span>商品名</span>
                <input
                  type="text"
                  placeholder="例：海鮮サラダ"
                  value={item.name}
                  onChange={handleNameChange(item.id)}
                />
              </label>

              <label>
                <span>税抜価格</span>
                <div className="price-input">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="888"
                    value={item.price}
                    onChange={handlePriceChange(item.id)}
                  />
                  <span className="suffix">円</span>
                </div>
              </label>
            </fieldset>
          ))}
        </section>

        <section className="preview-panel" aria-label="プレビューとダウンロード">
          <div className="preview-stage" ref={previewStageRef}>
            <div
              className={`menu-page ${
                visibleCount === 1 ? 'menu-page--single' : 'menu-page--double'
              }`}
              ref={previewRef}
              style={{
                transform: `scale(${pageScale})`,
                transformOrigin: 'top center',
              }}
            >
              {itemsToRender.map((item) => (
                <MenuPreview
                  key={item.id}
                  item={item}
                  shadowColor={shadowColor}
                />
              ))}
            </div>
          </div>
          <button className="download-button" type="button" onClick={handleDownload}>
            PNGとしてダウンロード
          </button>
        </section>
      </main>
    </div>
  )
}

export default App
