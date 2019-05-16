'use strict'
/* This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

class GameOfLifeCPU
{
  constructor( canvas, width, height )
  {
    this._time = 0
    this._canvas = canvas
    this._context2d = canvas.getContext("2d")
    this._cells1 = new ImageData( new Uint8ClampedArray(4*width*height), width, height )
    this._cells2 = new ImageData( new Uint8ClampedArray(4*width*height), width, height )
    this._worker = new Worker( URL.createObjectURL(GameOfLifeCPU.workerCodeBlob) )
    this._buffer = document.createElement('canvas')
    this._buffer.width = width
    this._buffer.height= height
    this._sync = Promise.resolve() // <- makes sure _cells1 is not neutered before use
    this._outOfDate = true
  }

  get time()   { return this._time }
  get width()  { return this._buffer.width }
  get height() { return this._buffer.height }

  clear() {
    return this._sync = this._sync.then( () => {
      this._cells1.data.fill(0)
      this._time = 0
      this._outOfDate = true
    })
  }

  toggleCell( x, y )
  {
    x = Math.trunc(x)
    y = Math.trunc(y)
    const { width: W, height: H } = this
    if( 0 > x || x >= W ||
        0 > y || y >= H )
      return Promise.resolve();

    return this._sync = this._sync.then( () => {
      const { data: cells } = this._cells1
      cells[(W*y+x)*4+3] = 255 - cells[(W*y+x)*4+3]
      this._outOfDate = true
    })
  }

  setCell( x, y, value )
  {
    x = Math.trunc(x)
    y = Math.trunc(y)
    const { width: W, height: H } = this
    if( 0 > x || x >= W ||
        0 > y || y >= H )
      return Promise.resolve();
    value = !!value

    return this._sync = this._sync.then( () => {
      this._cells1.data[(W*y+x)*4+3] = 255*value
      this._outOfDate = true
    })
  }

  getCell( x, y )
  {
    x = Math.trunc(x)
    y = Math.trunc(y)
    const { width: W, height: H } = this
    if( 0 > x || x >= W ||
        0 > y || y >= H )
      return Promise.resolve(undefined);

    return this._sync = this._sync.then(
      () => !! this._cells1.data[(W*y+x)*4+3]
    )
  }

  update() {
    return this._sync = this._sync.then(
      () => new Promise( resolve => {
        console.assert( ! this._worker.onmessage )
        this._worker.postMessage(
          [this._cells1, this._cells2],
          [this._cells1.data.buffer, this._cells2.data.buffer]
        )
        this._worker.onmessage = ({ data: [img1, img2] }) => {
          this._worker.onmessage = null
          this._cells1 = img1
          this._cells2 = img2
          this._outOfDate = true
          this._time += 1
          resolve()
        }
      })
    )
  }

  async render( x, y, scale )
  {
    if( this._outOfDate ) {
      this._outOfDate = false
      this._sync = this._sync.then( () => {
        const ctx = this._buffer.getContext('2d')
        ctx.putImageData(this._cells1, 0,0)
      })
      await this._sync
    }
    console.assert( ! this._outOfDate )

    const { width: W, height: H, _context2d: ctx } = this

    ctx.lineWidth = 4
    ctx.imageSmoothingEnabled = false

    ctx.clearRect(0,0, this._canvas.width,this._canvas.height)

    ctx.drawImage(this._buffer, x,y, scale*W, scale*H)

    ctx.strokeStyle = '#0000FFFF'
    ctx.strokeRect(
      x-ctx.lineWidth/2,
      y-ctx.lineWidth/2,
      ctx.lineWidth + scale*W,
      ctx.lineWidth + scale*H
    )

    if( scale > 7 )
    {
      ctx.strokeStyle = '#A0A0A0'
      ctx.lineWidth = 1

      for( let i=1; i < H; i++ )
      {
        ctx.beginPath()
        ctx.moveTo(x,        y+i*scale)
        ctx.lineTo(x+W*scale,y+i*scale)
        ctx.stroke()
      }

      for( let i=1; i < W; i++ )
      {
        ctx.beginPath()
        ctx.moveTo(x+i*scale,y        )
        ctx.lineTo(x+i*scale,y+H*scale)
        ctx.stroke()
      }
    }
  }
}
GameOfLifeCPU.workerCodeBlob = new Blob([`
  onmessage = ({ data: [img1, img2] }) => {
    console.assert( img1.width = img2.width )
    console.assert( img1.height= img2.height)
    console.assert( ! Object.is(img1,img2) )

    const { data: cells1, width: W, height: H } = img1
    const { data: cells2                      } = img2

    for( let i=0; i < H; i++ )
    for( let j=0; j < W; j++ )
    {
      let neighbors = 0
      for( let k=-1; k < 2; k++ ) { const y = i+k; if( 0 <= y && y < H )
      for( let l=-1; l < 2; l++ ) { const x = j+l; if( 0 <= x && x < W )
        neighbors += 0 < cells1[(W*y+x)*4+3]
      }}

      if(  cells1[(W*i+j)*4+3] )
           cells2[(W*i+j)*4+3] = 255*(3 <= neighbors && neighbors <= 4)
      else cells2[(W*i+j)*4+3] = 255*(3 === neighbors)
    }

    postMessage([img2,img1], [cells2.buffer, cells1.buffer])
  }
`], { type: 'text/javascript'} )
