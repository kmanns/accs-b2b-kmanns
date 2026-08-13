/*
 * Hero block — supports a full-bleed background image OR video.
 *
 * Authoring:
 *  - Image-only (default): a <picture>/<img> is used as the background.
 *  - Video: author a link whose href ends in .mp4/.webm/.mov (or an anchor whose
 *    text is such a URL). The linked video becomes an autoplaying, muted, looping
 *    background <video>. Any authored image is reused as the video `poster` and as
 *    the fallback for browsers/users where video does not play.
 *
 * Accessibility/perf:
 *  - Video is muted + playsinline + loop, preload="metadata".
 *  - Respects prefers-reduced-motion: the video is not autoplayed; poster/image shows.
 */

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

function findVideoSource(block) {
  const anchors = [...block.querySelectorAll('a[href]')];
  const anchor = anchors.find(
    (a) => VIDEO_EXT.test(a.getAttribute('href')) || VIDEO_EXT.test(a.textContent.trim()),
  );
  if (!anchor) return null;
  const href = VIDEO_EXT.test(anchor.getAttribute('href'))
    ? anchor.getAttribute('href')
    : anchor.textContent.trim();
  return { href, anchor };
}

function buildVideo(src, posterImg) {
  const video = document.createElement('video');
  video.className = 'hero-video';
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.setAttribute('loop', '');
  video.setAttribute('aria-hidden', 'true');
  video.preload = 'metadata';
  video.tabIndex = -1;

  if (posterImg?.currentSrc || posterImg?.src) {
    video.poster = posterImg.currentSrc || posterImg.src;
  }

  const source = document.createElement('source');
  source.src = src;
  const ext = src.split('?')[0].split('.').pop().toLowerCase();
  const typeMap = {
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4',
  };
  source.type = typeMap[ext] || 'video/mp4';
  video.append(source);
  return video;
}

export default function decorate(block) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const videoInfo = findVideoSource(block);
  const picture = block.querySelector('picture');
  const posterImg = picture?.querySelector('img');

  if (videoInfo) {
    // Remove the authoring anchor so only the media + overlay text remain.
    const anchorContainer = videoInfo.anchor.closest('p, div') || videoInfo.anchor;
    if (anchorContainer.parentElement && anchorContainer.textContent.trim() === videoInfo.anchor.textContent.trim()) {
      anchorContainer.remove();
    } else {
      videoInfo.anchor.remove();
    }

    if (!reduceMotion) {
      const video = buildVideo(videoInfo.href, posterImg);
      if (picture) {
        picture.replaceWith(video);
      } else {
        block.querySelector('div > div')?.insertAdjacentElement('afterbegin', video);
      }
      block.classList.add('hero--video');

      const tryPlay = () => {
        const p = video.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      };
      if (video.readyState >= 2) tryPlay();
      else video.addEventListener('loadeddata', tryPlay, { once: true });
    } else {
      // Reduced motion: keep the poster image (picture) as the static background.
      block.classList.add('hero--video', 'hero--reduced-motion');
    }
  }

  // Scrim for text legibility whenever there is background media.
  if (block.querySelector('picture, video.hero-video')) {
    block.classList.add('hero--has-media');
  }
}
