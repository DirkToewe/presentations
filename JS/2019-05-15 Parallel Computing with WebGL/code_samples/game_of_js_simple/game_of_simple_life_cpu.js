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
  constructor( width, height )
  {
    this._time = 0
    this._canvas = document.createElement('canvas')
    this._canvas.width = width
    this._canvas.height= height
    this._context2d = this._canvas.getContext("2d")
    this._cells1 = new ImageData( new Uint8ClampedArray(4*width*height), width, height )
    this._cells2 = new ImageData( new Uint8ClampedArray(4*width*height), width, height )
    this._worker = new Worker( URL.createObjectURL(GameOfLifeCPU.workerCodeBlob) )
    this._updateInProgress = Promise.resolve()
    this._outOfDate = true
  }

  get time  () { return this._time }
  get width () { return this._canvas.width  }
  get height() { return this._canvas.height }

  async toggleCell( x, y )
  {
    x = Math.trunc(x)
    y = Math.trunc(y)
    const { width: W, height: H } = this
    if( 0 > x || x >= W ||
        0 > y || y >= H )
      return;

    await this._updateInProgress

    const { data: cells } = this._cells1
    if( 0 <= x && x < W )
    if( 0 <= x && x < H )
      cells[(W*y+x)*4+3] = 255 - cells[(W*y+x)*4+3]

    this._outOfDate = true
  }

  async setCell( x, y, value )
  {
    x = Math.trunc(x)
    y = Math.trunc(y)
    const { width: W, height: H } = this
    if( 0 > x || x >= W ||
        0 > y || y >= H )
      return;
    value = !!value

    await this._updateInProgress

    const { data: cells } = this._cells1
    cells[(W*y+x)*4+3] = 255*value

    this._outOfDate = true
  }

  async getCell( x, y )
  {
    x = Math.trunc(x)
    y = Math.trunc(y)
    const { width: W, height: H } = this
    if( 0 > x || x >= W ||
        0 > y || y >= H )
      return undefined;

    await this._updateInProgress

    const { data: cells } = this._cells1
    return !!cells[(W*y+x)*4+3]
  }

  async update()
  {
    const worker = this._worker;

    await this._outOfDate

    this._updateInProgress = new Promise( resolve => {
      worker.postMessage(
        [this._cells1, this._cells2],
        [this._cells1.data.buffer, this._cells2.data.buffer]
      )
      worker.onmessage = ({ data: [img1, img2] }) => {
        worker.onmessage = null
        this._cells1 = img1
        this._cells2 = img2
        this._outOfDate = true
        this._time += 1
        resolve()
      }
    });

    await this._updateInProgress
  }

  async render( context2d, x, y, scale )
  {
    if( this._outOfDate ) {
      await this._updateInProgress
      this._context2d.putImageData(this._cells1, 0,0)
      this._outOfDate = false
    }
    const { width: W, height: H } = this
    context2d.drawImage(this._canvas, x,y, scale*W, scale*H)
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
