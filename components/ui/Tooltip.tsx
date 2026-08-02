'use client'

import { ReactNode, useRef, useState, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  text: string
  children: ReactNode
  enabled?: boolean
  side?: 'top' | 'right'
  wrapperClassName?: string
  offset?: number
}

/**
 * Portal-based balloon tooltip — renders outside the sidebar DOM so it
 * never triggers horizontal scroll on the parent container.
 * Shows above the hovered element by default; flips below if near the top edge.
 */
export function Tooltip({
  text,
  children,
  enabled = true,
  side = 'top',
  wrapperClassName = 'inline-flex',
  offset = 10,
}: TooltipProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{
    placement: 'top' | 'bottom' | 'right'
    anchorTop: number
    anchorBottom: number
    anchorLeft: number
    anchorRight: number
    anchorWidth: number
    anchorHeight: number
    top?: number
    left?: number
    arrowTop?: number
    arrowLeft?: number
    ready: boolean
  } | null>(null)

  const getAnchorRect = () => {
    if (!ref.current) return null
    const child = ref.current.firstElementChild
    if (child instanceof HTMLElement) return child.getBoundingClientRect()
    return ref.current.getBoundingClientRect()
  }

  const show = () => {
    if (!enabled) return
    const r = getAnchorRect()
    if (!r) return

    if (side === 'right') {
      setPos({
        placement: 'right',
        anchorTop: r.top,
        anchorBottom: r.bottom,
        anchorLeft: r.left,
        anchorRight: r.right,
        anchorWidth: r.width,
        anchorHeight: r.height,
        ready: false,
      })
      return
    }

    const below = r.top < 60
    setPos({
      placement: below ? 'bottom' : 'top',
      anchorTop: r.top,
      anchorBottom: r.bottom,
      anchorLeft: r.left,
      anchorRight: r.right,
      anchorWidth: r.width,
      anchorHeight: r.height,
      ready: false,
    })
  }

  const hide = () => setPos(null)

  useLayoutEffect(() => {
    if (!pos || !tipRef.current) return

    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
    const tooltipRect = tipRef.current.getBoundingClientRect()
    const margin = 12

    if (pos.placement === 'right') {
      const anchorMiddle = pos.anchorTop + pos.anchorHeight / 2
      const nextTop = clamp(
        anchorMiddle - tooltipRect.height / 2,
        margin,
        Math.max(margin, window.innerHeight - tooltipRect.height - margin)
      )
      const nextLeft = clamp(
        pos.anchorRight + offset,
        margin,
        Math.max(margin, window.innerWidth - tooltipRect.width - margin)
      )
      const nextArrowTop = clamp(
        anchorMiddle - nextTop,
        12,
        Math.max(12, tooltipRect.height - 12)
      )

      if (
        pos.ready &&
        Math.abs((pos.top ?? 0) - nextTop) < 0.5 &&
        Math.abs((pos.left ?? 0) - nextLeft) < 0.5 &&
        Math.abs((pos.arrowTop ?? tooltipRect.height / 2) - nextArrowTop) < 0.5
      ) {
        return
      }

      setPos(current =>
        current && current.placement === 'right'
          ? { ...current, top: nextTop, left: nextLeft, arrowTop: nextArrowTop, ready: true }
          : current
      )
      return
    }

    const anchorMiddle = pos.anchorLeft + pos.anchorWidth / 2
    const nextLeft = clamp(
      anchorMiddle - tooltipRect.width / 2,
      margin,
      Math.max(margin, window.innerWidth - tooltipRect.width - margin)
    )
    const nextArrowLeft = clamp(
      anchorMiddle - nextLeft,
      12,
      Math.max(12, tooltipRect.width - 12)
    )
    const nextTop =
      pos.placement === 'bottom'
        ? Math.min(
            pos.anchorBottom + offset,
            Math.max(margin, window.innerHeight - tooltipRect.height - margin)
          )
        : Math.max(margin, pos.anchorTop - tooltipRect.height - offset)

    if (
      pos.ready &&
      Math.abs((pos.top ?? 0) - nextTop) < 0.5 &&
      Math.abs((pos.left ?? 0) - nextLeft) < 0.5 &&
      Math.abs((pos.arrowLeft ?? tooltipRect.width / 2) - nextArrowLeft) < 0.5
    ) {
      return
    }

    setPos(current =>
      current && current.placement !== 'right'
        ? { ...current, top: nextTop, left: nextLeft, arrowLeft: nextArrowLeft, ready: true }
        : current
    )
  }, [offset, pos])

  // Hide on scroll/resize
  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [pos])

  const tip = pos ? (
    <span
      ref={tipRef}
      role="tooltip"
      style={{
        position: 'fixed',
        top: pos.top ?? -9999,
        left: pos.left ?? -9999,
        transform: 'none',
        zIndex: 9999,
        pointerEvents: 'none',
        whiteSpace: pos.placement === 'right' ? 'normal' : 'nowrap',
        maxWidth: 'min(20rem, calc(100vw - 2rem))',
        visibility: pos.ready ? 'visible' : 'hidden',
      }}
      className="rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 shadow-xl ring-1 ring-slate-200/90 select-none"
    >
      {/* Arrow */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          ...(pos.placement === 'right'
            ? {
                left: 0,
                top: pos.arrowTop ?? '50%',
                transform: 'translate(-100%, -50%)',
                borderRight: '6px solid #ffffff',
                borderTop: '6px solid transparent',
                borderBottom: '6px solid transparent',
              }
            : pos.placement === 'bottom'
              ? {
                  left: pos.arrowLeft ?? '50%',
                  bottom: '100%',
                  transform: 'translateX(-50%)',
                  borderBottom: '5px solid #ffffff',
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                }
              : {
                  left: pos.arrowLeft ?? '50%',
                  top: '100%',
                  transform: 'translateX(-50%)',
                  borderTop: '5px solid #ffffff',
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                }
          ),
          width: 0,
          height: 0,
          filter: 'drop-shadow(0 1px 1px rgba(15, 23, 42, 0.12))',
        }}
      />
      {text}
    </span>
  ) : null

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className={wrapperClassName}
    >
      {children}
      {typeof window !== 'undefined' && tip ? createPortal(tip, document.body) : null}
    </span>
  )
}
