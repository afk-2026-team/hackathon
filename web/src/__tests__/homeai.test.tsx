import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomeAssistant } from '../components/HomeAssistant'

// 테스트 평면 격리용 응답(실제 답변 아님)
const profile = { country: 'US', language: 'en', currency: 'USD', gender: 'female', age_range: '25-34' }
const answer = (text: string) => ({ id: 'resp_1', object: 'response', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] })

let calls: { body: Record<string, unknown> }[]
let fail = false
beforeEach(() => {
  calls = []
  fail = false
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    calls.push({ body: JSON.parse(init!.body as string) })
    if (fail) return new Response(JSON.stringify({ error: { message: 'The assistant is not available right now.' } }), { status: 503 })
    return new Response(JSON.stringify(answer('Try Candidate Cream 75ml for dry areas.')))
  }))
})

describe('Home AI', () => {
  it('asks only when the user taps and shows the server text as is', async () => {
    const user = userEvent.setup()
    render(<HomeAssistant profile={profile} onBrowse={() => {}} />)
    expect(calls).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Suggest for me' }))
    expect(await screen.findByText('Try Candidate Cream 75ml for dry areas.')).toBeInTheDocument()
    expect(calls[0].body).toMatchObject({ input: null, metadata: { profile: { country: 'US', language: 'en', gender: 'female', age_band: '25-34' } } })
    expect(screen.queryByRole('button', { name: /Open/ })).toBeNull() // 자유 텍스트를 카드로 바꾸지 않는다
    await user.type(screen.getByLabelText('Your question'), 'Any sunscreen?')
    await user.click(screen.getByRole('button', { name: 'Ask' }))
    expect(await screen.findByText('Any sunscreen?')).toBeInTheDocument()
    expect(calls[1].body).toMatchObject({ input: 'Any sunscreen?' })
  })

  it('shows the error with retry and keeps working after a failure', async () => {
    fail = true
    const user = userEvent.setup()
    render(<HomeAssistant profile={profile} onBrowse={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Suggest for me' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/503/)).toBeNull()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Try Candidate Cream 75ml for dry areas.')).toBeInTheDocument()
  })
})
