import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import { toPng } from 'html-to-image'
import './App.css'

const TAX_RATE = 0.1
const PAGE_WIDTH = 794
const PAGE_HEIGHT = 1123

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
  { id: 'item-1', name: '海鮮ねばねば', price: '980' },
  { id: 'item-2', name: '海鮮サラダ', price: '888' },
]

const yenFormatter = new Intl.NumberFormat('ja-JP', {
  maximumFractionDigits: 0,
})

const sanitizeDigits = (value: string) => value.replace(/[^\d]/g, '')

const formatPrice = (value: number) =>
  value > 0 ? `${yenFormatter.format(value)}` : ''

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

    const availableHeight = parent.clientHeight
    if (!availableHeight) return

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

function App() {
  const [items, setItems] = useState<MenuItem[]>(initialItems)
  const [visibleCount, setVisibleCount] = useState<1 | 2>(2)
  const [shadowColor, setShadowColor] = useState('#57e8ff')
  const [pageScale, setPageScale] = useState(1)
  const previewRef = useRef<HTMLDivElement>(null)
  const previewStageRef = useRef<HTMLDivElement>(null)

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
    if (!previewRef.current) return
    const node = previewRef.current
    const previousTransform = node.style.transform
    node.style.transform = 'scale(1)'

    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
      })
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:T]/g, '')
        .slice(0, 12)
      const link = document.createElement('a')
      link.download = `menu_${timestamp}.png`
      link.href = dataUrl
      link.click()
    } catch (error) {
      console.error(error)
      alert('PNGの書き出しに失敗しました。もう一度お試しください。')
    } finally {
      node.style.transform = previousTransform
    }
  }

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
              onChange={(event) => setShadowColor(event.target.value)}
              aria-label="影の色を選択"
            />
          </label>

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
