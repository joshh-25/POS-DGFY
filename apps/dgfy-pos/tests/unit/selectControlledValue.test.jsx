// @vitest-environment jsdom
import React, { useLayoutEffect, useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../packages/web-core/Components/ui/select.jsx'

afterEach(cleanup)

function ControlledSelectHarness({ value, onSnapshot }) {
  const valueRef = useRef(null)

  useLayoutEffect(() => {
    onSnapshot(valueRef.current?.textContent ?? '')
  })

  return (
    <Select value={value} onValueChange={() => {}}>
      <SelectTrigger>
        <span ref={valueRef}>
          <SelectValue placeholder="Choose a status" />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="draft">Draft</SelectItem>
        <SelectItem value="active">Active</SelectItem>
      </SelectContent>
    </Select>
  )
}

describe('Select controlled value presentation', () => {
  it('uses an externally changed value during the first render after the prop changes', () => {
    const snapshots = []
    const { rerender } = render(
      <ControlledSelectHarness value="draft" onSnapshot={(label) => snapshots.push(label)} />
    )

    snapshots.length = 0
    rerender(
      <ControlledSelectHarness value="active" onSnapshot={(label) => snapshots.push(label)} />
    )

    expect(snapshots[0]).toBe('Active')
  })
})
