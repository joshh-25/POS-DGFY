// @vitest-environment jsdom
import React, { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Dialog, DialogContent, DialogTitle } from '../dialog.jsx'

afterEach(cleanup)

function DialogHarness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open shift prompt</button>
      <a href="#background">Background navigation</a>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Open Shift</DialogTitle>
          <input aria-label="Opening Cash" autoFocus />
          <input aria-label="Opening Note" />
          <button type="button">Skip for Admin</button>
          <button type="button" onClick={() => setOpen(false)}>Open Shift</button>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DialogOverlayHarness({ overlayClassName }) {
  return (
    <Dialog open onOpenChange={() => {}} overlayClassName={overlayClassName}>
      <DialogContent>
        <DialogTitle>Checkout</DialogTitle>
      </DialogContent>
    </Dialog>
  )
}

function NestedDialogHarness() {
  const [parentOpen, setParentOpen] = useState(false)
  const [childOpen, setChildOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setParentOpen(true)}>Open parent</button>
      <Dialog open={parentOpen} onOpenChange={setParentOpen}>
        <DialogContent>
          <DialogTitle>Parent</DialogTitle>
          <button type="button" onClick={() => setChildOpen(true)}>Open child</button>
          <button type="button" onClick={() => setParentOpen(false)}>Close parent</button>
        </DialogContent>
      </Dialog>
      <Dialog open={childOpen} onOpenChange={setChildOpen}>
        <DialogContent>
          <DialogTitle>Child</DialogTitle>
          <button type="button" onClick={() => setChildOpen(false)}>Close child</button>
        </DialogContent>
      </Dialog>
    </>
  )
}

describe('Dialog focus management', () => {
  it('exposes modal semantics and focuses the requested initial field', () => {
    render(<DialogHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open shift prompt' }))

    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(screen.getByLabelText('Opening Cash'))
  })

  it('wraps Tab and Shift+Tab inside the active dialog', () => {
    render(<DialogHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open shift prompt' }))

    const firstControl = screen.getByLabelText('Opening Cash')
    const lastControl = screen.getByRole('button', { name: 'Open Shift' })

    lastControl.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(firstControl)

    firstControl.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(lastControl)
    expect(document.activeElement).not.toBe(screen.getByRole('link', { name: 'Background navigation' }))
  })

  it('portals the dialog outside transformed workspace wrappers', () => {
    const { container } = render(
      <div style={{ transform: 'translateX(0)' }}>
        <Dialog open onOpenChange={() => {}}>
          <DialogContent>
            <DialogTitle>Repay Employee Credit in full?</DialogTitle>
          </DialogContent>
        </Dialog>
      </div>
    )

    const root = document.querySelector('[data-dialog-root="true"]')
    expect(root).not.toBeNull()
    expect(root.parentElement).toBe(document.body)
    expect(container.querySelector('[data-dialog-root="true"]')).toBeNull()
  })

  it('allows a caller to replace the backdrop blur without removing the dark overlay', () => {
    render(<DialogOverlayHarness overlayClassName="backdrop-blur-none" />)

    const overlay = document.querySelector('[data-dialog-overlay="true"]')
    expect(overlay).not.toBeNull()
    expect(overlay.className).toContain('bg-slate-950/60')
    expect(overlay.className).toContain('backdrop-blur-none')
    expect(overlay.className).not.toContain('backdrop-blur-sm')
  })

  it('keeps body scrolling locked until the final nested dialog closes', () => {
    document.body.style.overflow = 'scroll'
    render(<NestedDialogHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Open parent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open child' }))
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.click(screen.getByRole('button', { name: 'Close child' }))
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.click(screen.getByRole('button', { name: 'Close parent' }))
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('restores focus through nested dialogs and back to the original trigger', () => {
    render(<NestedDialogHarness />)
    const parentTrigger = screen.getByRole('button', { name: 'Open parent' })
    parentTrigger.focus()
    fireEvent.click(parentTrigger)

    const childTrigger = screen.getByRole('button', { name: 'Open child' })
    fireEvent.click(childTrigger)
    fireEvent.click(screen.getByRole('button', { name: 'Close child' }))
    expect(document.activeElement).toBe(childTrigger)

    fireEvent.click(screen.getByRole('button', { name: 'Close parent' }))
    expect(document.activeElement).toBe(parentTrigger)
  })
})
