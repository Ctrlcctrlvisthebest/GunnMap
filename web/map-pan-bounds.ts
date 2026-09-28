interface TransformValues {
  x: number;
  y: number;
  scale: number;
}

export function setBoundedImageTransform(
  image: HTMLElement,
  viewport: HTMLElement,
  { x, y, scale }: TransformValues,
) {
  const viewportStyle = window.getComputedStyle(viewport);
  const viewportWidth = viewport.clientWidth
    - Number.parseFloat(viewportStyle.paddingLeft)
    - Number.parseFloat(viewportStyle.paddingRight);
  const viewportHeight = viewport.clientHeight
    - Number.parseFloat(viewportStyle.paddingTop)
    - Number.parseFloat(viewportStyle.paddingBottom);
  const maxX = Math.max(0, (image.offsetWidth - viewportWidth / scale) / 2);
  const maxY = Math.max(0, (image.offsetHeight - viewportHeight / scale) / 2);
  const boundedX = Math.max(-maxX, Math.min(maxX, x));
  const boundedY = Math.max(-maxY, Math.min(maxY, y));

  image.style.transform = `scale(${scale}) translate(${boundedX}px, ${boundedY}px)`;
  return { x: boundedX, y: boundedY };
}
