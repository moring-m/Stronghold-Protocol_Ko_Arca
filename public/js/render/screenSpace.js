// DOM client coordinates are physical CSS pixels; Pixi works in the canvas's unzoomed layout pixels.
export function clientToCanvas(rect,screen,x,y){return{x:(x-rect.left)*screen.width/Math.max(1,rect.width),y:(y-rect.top)*screen.height/Math.max(1,rect.height)};}
export function canvasToClient(rect,screen,x,y){return{x:rect.left+x*rect.width/Math.max(1,screen.width),y:rect.top+y*rect.height/Math.max(1,screen.height)};}
