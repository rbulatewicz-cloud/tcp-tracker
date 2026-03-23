export const generateDefaultLogo = () => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  
  // Black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 800, 400);

  // SFTC Text
  ctx.font = 'bold 220px Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#00529B';
  ctx.textAlign = 'center';
  ctx.fillText('SFTC', 400, 180);

  // Swooshes
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  
  ctx.beginPath();
  ctx.moveTo(120, 160);
  ctx.bezierCurveTo(300, 280, 500, 280, 680, 200);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(90, 130);
  ctx.bezierCurveTo(280, 240, 480, 240, 650, 160);
  ctx.stroke();

  // Subtext
  ctx.font = 'bold 70px Helvetica, Arial, sans-serif';
  ctx.fillText('San Fernando Transit', 400, 290);
  ctx.font = 'normal 60px Helvetica, Arial, sans-serif';
  ctx.fillText('Constructors', 400, 360);

  return canvas.toDataURL('image/jpeg', 0.9);
};
