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

class GameOfLifeWebGL
{
  _compileProgram({ vertexShader, fragmentShader })
  {
    console.assert( 'string' === typeof   vertexShader )
    console.assert( 'string' === typeof fragmentShader )
    const gl = this._gl

    function compileShader(code,type)
    {
      code = code.trim();
      const shader = gl.createShader(type);
      gl.shaderSource(shader, code);
      gl.compileShader(shader);

      const log = gl.getShaderInfoLog(shader);
      console.info(log);

      const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);

      if(compiled) return shader;
      else {
        gl.deleteShader(shader);
        throw new Error('Could not compile shader.');
      }
    }

    const vertShader = compileShader(  vertexShader, gl.  VERTEX_SHADER);
    const fragShader = compileShader(fragmentShader, gl.FRAGMENT_SHADER);

    const program = gl.createProgram();
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    var log = gl.getProgramInfoLog(program);
    console.info(log);

    const compiled = gl.getProgramParameter( program, gl.LINK_STATUS);

    if(compiled) return program;
    else {
      gl.deleteProgram(program);
      throw new Error('Could not link program.');
    }
  }

  _finish()
  {
    const gl = this._gl,
        sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);

    gl.flush()

    return new Promise( resolve => {
      const loop = setInterval( () => {
          const status = gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if( gl.SIGNALED == status ) {
            clearInterval(loop)
            resolve()
          }
      })
    })
  }

  constructor( width, height )
  {
    this._canvas = document.createElement('canvas')
    this._canvas.width = width
    this._canvas.height= height

    const gl = this._gl = this._canvas.getContext("webgl2",{
      antialias: false,
      stencil: false,
      alpha: true
    })
    console.assert( this._gl != null )

    console.log( 'GLSL Version:', gl.getParameter(gl.SHADING_LANGUAGE_VERSION) );

    if( ! gl.getExtension('EXT_color_buffer_float') )
      throw new Error('HDR rendering not supported.');

    this._renderProgram = this._compileProgram({
      vertexShader: `
        #version 300 es
        precision highp float;
        precision highp int;

        // INPUTS
        in vec2 in_ij;

        // OUTPUTS
        out vec2 cells_ij;

        uniform vec2 cells_size;

        // COMPUTATION
        void main() {
          cells_ij  = in_ij * vec2(+0.5,-0.5) + 0.5;
          cells_ij *= cells_size;
          gl_Position = vec4(in_ij, 0, 1 );
        }
      `,
      fragmentShader: `
        #version 300 es
        precision highp float;
        precision highp int;

        // INPUTS
        in vec2 cells_ij;

        uniform sampler2D cells;

        // OUTPUTS
        out vec4 color;

        // COMPUTATION
        void main() {
          ivec2 ij = ivec2(cells_ij) + 1;
          vec4 cell = texelFetch(cells, ij, 0);
          color = vec4(0,0,0,cell[0]);
        }
      `
    })

    this._updateProgram = this._compileProgram({
      vertexShader: `
        #version 300 es
        precision highp float;
        precision highp int;

        // INPUTS
        in vec2 in_ij;

        // OUTPUTS
        out vec2 cells_ij;

        uniform vec2 cells_size;

        // COMPUTATION
        void main() {
          cells_ij  = in_ij * 0.5 + 0.5;
          cells_ij *= cells_size;
          gl_Position = vec4( in_ij, 0, 1 );
        }
      `,
      fragmentShader: `
        #version 300 es
        precision highp float;
        precision highp int;

        // INPUTS
        in vec2 cells_ij;

        uniform sampler2D cells;

        // OUTPUTS
        out float cell;

        // COMPUTATION
        void main() {
          ivec2 ij = ivec2(cells_ij);

          int neighbors = 0;
          for( int i=0; i < 3; i++ )
          for( int j=0; j < 3; j++ )
            neighbors += int( texelFetch(cells, ivec2(i,j) + ij, 0).x );

          cell = texelFetch(cells, 1 + ij, 0).x;
          if( cell == 0.0 )
            cell = 3 == neighbors ? 1.0 : 0.0;
          else
            cell = 3 <= neighbors && neighbors <= 4 ? 1.0 : 0.0;
        }
      `
    })

    this._frameBuf = gl.createFramebuffer()
    this._cells1 = gl.createTexture()
    this._cells2 = gl.createTexture()
    for( const tex of [this._cells1, this._cells2] )
    {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

      gl.texImage2D(
        /*target=*/gl.TEXTURE_2D,
        /*levelOfDetail=*/0,
        /*internalFormat=*/gl.R32F,
        /*width,height=*/width+2,height+2,
        /*border=*/0,
        /*format=*/gl.RED,
        /*type=*/gl.FLOAT,
        /*srcData=*/null
      );
    }

    this._buf_in_ij = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._buf_in_ij);
    gl.bufferData(gl.ARRAY_BUFFER,
       Float32Array.of(
         // TRIANGLES
         -1,-1,
         +1,-1,
         +1,+1,

         -1,+1,
         -1,-1,
         +1,+1
       ),
       gl.STATIC_DRAW, 0,0
    );

    this._time = 0
  }

  get time  () { return this._time }
  get width () { return this._canvas.width  }
  get height() { return this._canvas.height }

  async update() {
    const   gl = this._gl,
      buf_in_ij= this._buf_in_ij,
      program  = this._updateProgram
    gl.useProgram(program)
    const loc_in_ij    = gl. getAttribLocation(program, 'in_ij'),
          loc_cells_size= gl.getUniformLocation(program, 'cells_size')

    gl.bindBuffer(gl.ARRAY_BUFFER, buf_in_ij);
    gl.enableVertexAttribArray(loc_in_ij);
    gl.vertexAttribPointer(loc_in_ij, 2, gl.FLOAT, false, 8,0);

    gl.uniform2f(loc_cells_size, this.width,this.height)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuf);
    gl.bindTexture(gl.TEXTURE_2D, this._cells2);
    gl.framebufferTexture2D(
      /*target=*/gl.DRAW_FRAMEBUFFER,
      /*attachment=*/gl.COLOR_ATTACHMENT0,
      /*texTarget=*/gl.TEXTURE_2D,
      /*texture=*/this._cells2,
      /*levelOfDetail=*/0
    );
    gl.bindTexture(gl.TEXTURE_2D, this._cells1);

    // SET READ FROM MATRIX 1
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(1,1, this.width,this.height);
    gl.drawArrays(gl.TRIANGLES, 0,6);

    ([this._cells1, this._cells2] =
     [this._cells2, this._cells1])

    await this._finish()
    this._time += 1
  }

  toggleCell( x, y ) {
    return this.setCell(x,y, !this.getCell(x,y))
  }

  getCell( x, y )
  {
    x = Math.trunc(x)
    y = Math.trunc(y)
    const { _width: W, _height: H } = this
    if( 0 > x || x >= W ||
        0 > y || y >= H )
      return;

    const gl = this._gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuf);
    gl.framebufferTexture2D(
      /*target=*/gl.DRAW_FRAMEBUFFER,
      /*attachment=*/gl.COLOR_ATTACHMENT0,
      /*texTarget=*/gl.TEXTURE_2D,
      /*texture=*/this._cells1,
      /*levelOfDetail=*/0
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

    const pixel = new Float32Array(4)

    gl.readPixels(1+x,1+y, 1,1, gl.RGBA, gl.FLOAT, pixel)

    return !!pixel[0]
  }

  setCell( x, y, value )
  {
    x = Math.trunc(x)
    y = Math.trunc(y)
    const { _width: W, _height: H } = this
    if( 0 > x || x >= W ||
        0 > y || y >= H )
      return;
    value = !!value

    const gl = this._gl
    gl.bindTexture(gl.TEXTURE_2D, this._cells1)
    gl.texSubImage2D(
      /*target=*/gl.TEXTURE_2D,
      /*levelOfDetail=*/0,
      x+1,y+1, 1,1,
      /*format=*/gl.RED,
      /*type=*/gl.FLOAT,
      /*srcData=*/Float32Array.of(value)
    );
  }

  async render( context2d, x, y, scale )
  {
    if( 1 < scale ) {
      console.assert( scale%1 === 0 )
      scale |= 0
    }
    const gl = this._gl,
        { width: W, height: H } = this
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearBufferfv( gl.COLOR, 0, Float32Array.of(1,1,1,0) )

    // RENDER CONTENT
    const program = this._renderProgram
    gl.useProgram(program)
    const loc_in_ij      = gl. getAttribLocation(program, 'in_ij'),
          loc_cells_size = gl.getUniformLocation(program, 'cells_size')

    gl.bindBuffer(gl.ARRAY_BUFFER, this._buf_in_ij);
    gl.enableVertexAttribArray(loc_in_ij);
    gl.vertexAttribPointer(loc_in_ij, 2, gl.FLOAT, false, 2*4,0);

    gl.uniform2f(loc_cells_size, W,H)

    gl.bindTexture(gl.TEXTURE_2D, this._cells1);

    gl.viewport(0,0, W,H);
    gl.drawArrays(gl.TRIANGLES, 0,6)

    context2d.drawImage(this._canvas, x,y, scale*W, scale*H)
  }

  get time() {
    return this._time
  }
}
