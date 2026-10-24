import { useEffect, useState } from 'react'
import { ApiError, fetchVideos } from '../../lib/api'
import type { VideoEvidence, VideosResponse } from '../../lib/types'
import { fill, useT, type Lang } from '../../lib/i18n'
import { Sheet, SponsorBadge } from '../Common'
import { LoadingState } from '../States'

// 숏폼 근거. YouTube 검색 쿼터를 아끼려고 같은 질의는 세션 동안 한 번만 부른다(서버도 6시간 캐시).
const cache = new Map<string, Promise<VideosResponse>>()
export function resetVideoCache() {
  cache.clear()
}
function loadVideos(query: string, lang: Lang): Promise<VideosResponse> {
  const key = `${lang}:${query}`
  let p = cache.get(key)
  if (!p) {
    p = fetchVideos(query, lang, 6).catch((e: unknown) => {
      cache.delete(key) // 실패는 다음 진입 때 다시 시도
      throw e
    })
    cache.set(key, p)
  }
  return p
}

type State = { s: 'loading' } | { s: 'ready'; data: VideosResponse } | { s: 'error'; status: number; message: string }

export function VideoShelf({ query, lang }: { query: string; lang: Lang }) {
  const t = useT()
  const [state, setState] = useState<State>({ s: 'loading' })
  const [playing, setPlaying] = useState<VideoEvidence | null>(null)

  useEffect(() => {
    let alive = true
    loadVideos(query, lang)
      .then((data) => alive && setState({ s: 'ready', data }))
      .catch((e: unknown) => {
        if (!alive) return
        setState({ s: 'error', status: e instanceof ApiError ? e.status : 0, message: e instanceof Error ? e.message : '' })
      })
    return () => {
      alive = false
    }
  }, [query, lang])

  return (
    <section className="dt-sec" aria-labelledby="dt-videos-h">
      <div className="sec-h">
        <div>
          <h2 id="dt-videos-h">{t('detail.videos')}</h2>
          {state.s === 'ready' && state.data.items.length > 0 && <p className="sec-h__sub">{t('detail.videosLead')}</p>}
        </div>
      </div>
      {state.s === 'loading' && <LoadingState />}
      {state.s === 'error' && (
        <p className="note" role="status">{state.status === 503 ? t('detail.videosNoKey') : state.message}</p>
      )}
      {state.s === 'ready' && state.data.items.length === 0 && <p className="note">{t('detail.videosEmpty')}</p>}
      {state.s === 'ready' && state.data.items.length > 0 && (
        <ul className="dt-shelf hscroll">
          {state.data.items.map((v) => (
            <li key={v.video_id} className="dt-vcard" data-testid="video-card">
              <button type="button" className="dt-vcard__btn" onClick={() => setPlaying(v)} aria-label={v.title}>
                <span className="dt-vcard__thumb">
                  {v.thumbnail_url && <img src={v.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                  <span className="dt-vcard__play" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
                  </span>
                </span>
              </button>
              <div className="dt-vcard__meta">
                <SponsorBadge value={v.sponsorship} />
                <p className="dt-vcard__title">{v.title}</p>
                <p className="dt-vcard__sub">{v.channel} · {v.published_at.slice(0, 10)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="provenance dt-src">{t('detail.videosSource')}</p>
      {playing && (
        <Sheet title={playing.title} onClose={() => setPlaying(null)}>
          <div className="dt-player">
            <div className="dt-player__frame">
              <iframe
                src={playing.embed_url}
                title={fill(t('detail.videoPlayer'), { title: playing.title })}
                allow="encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
            <div className="dt-player__meta">
              <SponsorBadge value={playing.sponsorship} />
              <span className="muted small">{playing.channel} · {playing.published_at.slice(0, 10)}</span>
              <a className="dt-link" href={playing.url} target="_blank" rel="noreferrer noopener">{t('detail.videoOpen')}</a>
            </div>
            <p className="provenance">{t('detail.videosSource')}</p>
          </div>
        </Sheet>
      )}
    </section>
  )
}
