import React, { useEffect, useRef, useState } from "react"
import {
  type Matrix,
  applyToPoint,
  inverse,
  translate,
  scale,
  compose,
} from "transformation-matrix"

const rangeInclusive = (start: number, end: number, inc: number) => {
  const result = []
  if (end < start) {
    for (let i = start; i >= end; i -= Math.abs(inc)) {
      result.push(i)
    }
  } else {
    for (let i = start; i <= end; i += Math.abs(inc)) {
      result.push(i)
    }
  }
  return result
}

export interface SuperGridProps {
  /**
   * Represents the transformation between world and screen coordinates
   */
  transform: Matrix
  width: number
  height: number
  screenSpaceCellSize?: number
  textColor?: string
  majorColor?: string
  minorColor?: string
  stringifyCoord?: (x: number, y: number, cellSize?: number) => string
}

function roundPointToZ(Z: number, position: { x: number; y: number }) {
  return {
    x: Math.round(position.x / Z) * Z,
    y: Math.round(position.y / Z) * Z,
  }
}

export function toMeterSI(value: number, Z: number = 1): string {
  if (value < 0) return "-" + toMeterSI(-value)
  if (value < 0.000001) return "0m"

  if (value > 1e3) return Math.floor(value / 1000) + "km"
  if (value > 1 && Z > 1) return Math.round(value) + "m"
  if (value > 1 && Z <= 1) return value.toFixed(Math.ceil(-Math.log10(Z))) + "m"
  if (value < 1 && Z >= 1 / 1000) return Math.round(value * 1000) + "mm"
  if (value < 1 && Z < 1 / 1000)
    return (value * 1000).toFixed(Math.ceil(-Math.log10(Z * 1000))) + "mm"
  return ""
}

export function toMMSI(value: number, Z: number = 1): string {
  return toMeterSI(value / 1000, Z / 1000)
}

export const SuperGrid = (props: SuperGridProps) => {
  const ref = useRef<HTMLCanvasElement>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // Use local state for the transformation so that touch gestures can update it.
  const [localTransform, setLocalTransform] = useState<Matrix>(props.transform)
  useEffect(() => {
    setLocalTransform(props.transform)
  }, [props.transform])

  const {
    majorColor = "rgba(0,0,0,0.2)",
    minorColor = "rgba(0,0,0,0.1)",
    textColor = props.majorColor ?? "rgba(0,0,0,0.5)",
    width,
    height,
    screenSpaceCellSize = 200,
    stringifyCoord = (x, y, Z) => `${toMeterSI(x, Z)}, ${toMeterSI(y, Z)}`,
  } = props

  /**
   * Max number of major cells you could draw on the screen across its width
   */
  const cellScreenWidth = Math.ceil(width / screenSpaceCellSize) + 2
  /**
   * Max number of major cells you could draw on the screen across its height
   */
  const cellScreenHeight = Math.ceil(height / screenSpaceCellSize) + 2

  // Touch gesture tracking refs
  const gestureMode = useRef<"none" | "drag" | "pinch">("none")
  const lastTouch = useRef<{ x: number; y: number } | null>(null)
  const pinchData = useRef<{
    initialDistance: number
    initialMidpoint: { x: number; y: number }
    initialTransform: Matrix
  } | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const ctx = ref.current.getContext("2d")!
    if (!ctx) return

    // Determine the effective grid step based on scale.
    const Z =
      screenSpaceCellSize / 10 ** Math.floor(Math.log10(localTransform.a))
    const yInvN = localTransform.d < 0 ? -1 : 1
    const Za = screenSpaceCellSize / 10 ** Math.log10(localTransform.a)
    const Zp = Za / Z

    function drawGridLines(
      z: number,
      start: { x: number; y: number },
      end: { x: number; y: number },
    ) {
      const cellSize = z
      let lineStart, lineEnd

      // Vertical Lines
      for (let x = start.x; x <= end.x; x += cellSize) {
        lineStart = applyToPoint(localTransform, { x, y: start.y })
        lineEnd = applyToPoint(localTransform, { x, y: end.y })
        ctx.beginPath()
        ctx.moveTo(lineStart.x, lineStart.y)
        ctx.lineTo(lineEnd.x, lineEnd.y)
        ctx.stroke()
      }
      // Horizontal Lines
      const rowYs = rangeInclusive(start.y, end.y, cellSize * yInvN)
      for (const y of rowYs) {
        lineStart = applyToPoint(localTransform, { x: start.x, y })
        lineEnd = applyToPoint(localTransform, { x: end.x, y })
        ctx.beginPath()
        ctx.moveTo(lineStart.x, lineStart.y)
        ctx.lineTo(lineEnd.x, lineEnd.y)
        ctx.stroke()
      }
    }

    function drawGridText(
      z: number,
      start: { x: number; y: number },
      end: { x: number; y: number },
    ) {
      for (let x = start.x; x <= end.x; x += z) {
        for (const y of rangeInclusive(start.y, end.y, z * yInvN)) {
          const point = applyToPoint(localTransform, { x, y })
          ctx.fillStyle = textColor
          ctx.font = `12px sans-serif`
          ctx.fillText(stringifyCoord(x, y, z), point.x + 2, point.y - 2)
        }
      }
    }

    ctx.clearRect(0, 0, width, height)

    const topLeft = applyToPoint(inverse(localTransform), { x: 0, y: 0 })

    const zRoundedOffsetTopLeft = {
      x: Math.floor((topLeft.x - Z) / Z) * Z,
      y: Math.floor((topLeft.y - Z) / Z + (yInvN === -1 ? 2 : 0)) * Z,
    }
    const zRoundedOffsetBottomRight = {
      x: zRoundedOffsetTopLeft.x + Z * cellScreenWidth,
      y: zRoundedOffsetTopLeft.y + Z * cellScreenHeight * yInvN,
    }

    const textN = 5
    const NZ = Z * textN
    const NZRoundedOffsetTopLeft = {
      x: Math.floor((topLeft.x - NZ) / NZ) * NZ,
      y: Math.floor((topLeft.y - NZ) / NZ + (yInvN === -1 ? 2 : 0)) * NZ,
    }
    const NZRoundedOffsetBottomRight = {
      x: NZRoundedOffsetTopLeft.x + NZ * cellScreenWidth,
      y: NZRoundedOffsetTopLeft.y + NZ * cellScreenHeight * yInvN,
    }

    ctx.globalAlpha = 1
    ctx.strokeStyle = majorColor
    // Major Lines
    drawGridLines(Z, zRoundedOffsetTopLeft, zRoundedOffsetBottomRight)
    drawGridText(NZ, NZRoundedOffsetTopLeft, NZRoundedOffsetBottomRight)
    // Minor Lines
    ctx.globalAlpha = 1 - Zp
    drawGridLines(NZ / 10, NZRoundedOffsetTopLeft, NZRoundedOffsetBottomRight)
    ctx.globalAlpha = 1 - Zp
    ctx.strokeStyle = minorColor
    drawGridLines(Z / 10, zRoundedOffsetTopLeft, zRoundedOffsetBottomRight)
    ctx.globalAlpha = Math.max(((1 - Zp) * 10 - 5) / 5, 0)
    drawGridText(NZ / 10, NZRoundedOffsetTopLeft, NZRoundedOffsetBottomRight)

    ctx.globalAlpha = 1
    const projMousePos = applyToPoint(localTransform, mousePos)
    ctx.font = `12px sans-serif`
    ctx.fillStyle = textColor
    ctx.fillText(
      stringifyCoord(mousePos.x, mousePos.y, Z),
      projMousePos.x + 2,
      projMousePos.y - 2,
    )
    ctx.strokeStyle = majorColor
    ctx.strokeRect(projMousePos.x - 5, projMousePos.y - 5, 10, 10)
  }, [
    localTransform,
    mousePos,
    width,
    height,
    screenSpaceCellSize,
    majorColor,
    minorColor,
    textColor,
    stringifyCoord,
  ])

  const onMouseSetTarget = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!ref.current) return
    const Z =
      screenSpaceCellSize / 10 / 10 ** Math.floor(Math.log10(localTransform.a))
    const rect = ref.current.getBoundingClientRect()
    const projM = applyToPoint(inverse(localTransform), {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
    const m = roundPointToZ(Z, projM)
    setMousePos(m)
  }

  // --- Touch Event Handlers ---
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      // Start drag gesture
      gestureMode.current = "drag"
      const touch = e.touches[0]
      lastTouch.current = { x: touch.clientX, y: touch.clientY }
    } else if (e.touches.length === 2) {
      // Start pinch gesture
      gestureMode.current = "pinch"
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const dx = touch2.clientX - touch1.clientX
      const dy = touch2.clientY - touch1.clientY
      const distance = Math.hypot(dx, dy)
      const midpoint = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
      }
      pinchData.current = {
        initialDistance: distance,
        initialMidpoint: midpoint,
        initialTransform: localTransform,
      }
    }
    e.preventDefault()
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (
      gestureMode.current === "drag" &&
      e.touches.length === 1 &&
      lastTouch.current
    ) {
      const touch = e.touches[0]
      const deltaX = touch.clientX - lastTouch.current.x
      const deltaY = touch.clientY - lastTouch.current.y

      // Update the transform translation by simply adding the delta.
      setLocalTransform((prev) => ({
        ...prev,
        e: prev.e + deltaX,
        f: prev.f + deltaY,
      }))

      lastTouch.current = { x: touch.clientX, y: touch.clientY }
    } else if (
      gestureMode.current === "pinch" &&
      e.touches.length === 2 &&
      pinchData.current
    ) {
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const dx = touch2.clientX - touch1.clientX
      const dy = touch2.clientY - touch1.clientY
      const newDistance = Math.hypot(dx, dy)

      const { initialDistance, initialMidpoint, initialTransform } =
        pinchData.current!
      const scaleFactor = newDistance / initialDistance

      const newTransform = compose(
        translate(initialMidpoint.x, initialMidpoint.y),
        scale(scaleFactor, scaleFactor),
        translate(-initialMidpoint.x, -initialMidpoint.y),
        initialTransform,
      )
      setLocalTransform(newTransform)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) {
      gestureMode.current = "none"
      lastTouch.current = null
      pinchData.current = null
    }
    e.preventDefault()
  }

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      onMouseUp={(e) => {
        if (e.button !== 1) return
        onMouseSetTarget(e)
      }}
      onDoubleClick={onMouseSetTarget}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: "none", display: "block" }}
    />
  )
}
