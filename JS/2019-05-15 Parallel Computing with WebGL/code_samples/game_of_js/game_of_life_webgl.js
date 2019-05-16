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

  constructor( canvas, width, height )
  {
    this._canvas = canvas
    this._width = width
    this._height= height
    const gl = this._gl = canvas.getContext("webgl2",{
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
        out vec2 cell_ij;

        uniform vec2 screen_offset,
                     screen_size,
                     cell_size;

        // COMPUTATION
        void main() {
          cell_ij  = in_ij * vec2(+0.5,-0.5) + 0.5;
          cell_ij *= cell_size;
          gl_Position = vec4( screen_offset + screen_size*in_ij, 0, 1 );
        }
      `,
      fragmentShader: `
        #version 300 es
        precision highp float;
        precision highp int;

        // INPUTS
        in vec2 cell_ij;

        uniform sampler2D cells;
        uniform float scale;

        // OUTPUTS
        out vec4 color;

        // COMPUTATION
        void main() {
          // +1, because of a padding of 1 dead cell around the boundary
          ivec2 ij = ivec2(cell_ij) + 1;

          if( scale < 1.0 )
          {
            // if zoomed out far enough, super-sampling is necessary
            int s = int(1.0 / scale);
            float count = 0.0; // <- count living cells
            for( int i=0; i < s; i++ )
            for( int j=0; j < s; j++ ) {
              vec4 cell = texelFetch(cells, ivec2(i,j) + ij, 0);
              count += cell[0];
            }
            color = vec4(0,0,0, count*scale*scale);
          }
          else
          {
            vec4 cell = texelFetch(cells, ij, 0);
            color = vec4(0,0,0,cell[0]);

            // draw grid lines if zoomed in far enough
            if( scale > 7.0 )
            {
              int s = int(scale);
              ij = ivec2(cell_ij*scale) % s;
              if( ij[0] == s-1 || ij[1] == s-1 )
                color = vec4(0.75, 0.75, 0.75, 1);
            }
          }
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
        out vec2 cell_ij;

        uniform vec2 cell_size;

        // COMPUTATION
        void main() {
          cell_ij  = in_ij * 0.5 + 0.5;
          cell_ij *= cell_size;
          gl_Position = vec4( in_ij, 0, 1 );
        }
      `,
      fragmentShader: `
        #version 300 es
        precision highp float;
        precision highp int;

        // INPUTS
        in vec2 cell_ij;

        uniform sampler2D cells;

        // OUTPUTS
        out float cell;

        // COMPUTATION
        void main() {
          ivec2 ij = ivec2(cell_ij);

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

    this._clearProgram = this._compileProgram({
      vertexShader: `
        #version 300 es
        precision highp float;
        precision highp int;

        // INPUTS
        in vec2 in_ij;

        // OUTPUTS

        // COMPUTATION
        void main() {
          gl_Position = vec4( in_ij, 0, 1 );
        }
      `,
      fragmentShader: `
        #version 300 es
        precision highp float;
        precision highp int;

        // INPUTS
        uniform vec4 clear_val;

        // OUTPUTS
        out vec4 cell;

        // COMPUTATION
        void main() {
          cell = clear_val;
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

    const buf_in_ij = this._buf_in_ij = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf_in_ij);
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

  get time()   { return this._time }
  get width()  { return this._width }
  get height() { return this._height }

  async update() {
    const   gl = this._gl,
      buf_in_ij= this._buf_in_ij,
      program  = this._updateProgram
    gl.useProgram(program)
    const loc_in_ij    = gl. getAttribLocation(program, 'in_ij'),
          loc_cell_size= gl.getUniformLocation(program, 'cell_size')

    gl.bindBuffer(gl.ARRAY_BUFFER, buf_in_ij);
    gl.enableVertexAttribArray(loc_in_ij);
    gl.vertexAttribPointer(loc_in_ij, 2, gl.FLOAT, false, 8,0);

    gl.uniform2f(loc_cell_size, this._width,this._height)

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
    gl.viewport(1,1, this._width,this._height);
    gl.drawArrays(gl.TRIANGLES, 0,2*3);

    ([this._cells1, this._cells2] =
     [this._cells2, this._cells1])

    await this._finish()
    this._time += 1
  }

  toggleCell( x, y )
  {
    this.setCell(x,y, !this.getCell(x,y))
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
      return undefined;

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

  async clear()
  {
    const   gl = this._gl,
      buf_in_ij= this._buf_in_ij,
      program  = this._clearProgram
    gl.useProgram(program)
    const loc_in_ij     = gl. getAttribLocation(program, 'in_ij'),
          loc_clear_size= gl.getUniformLocation(program, 'clear_val')

    gl.bindBuffer(gl.ARRAY_BUFFER, buf_in_ij);
    gl.enableVertexAttribArray(loc_in_ij);
    gl.vertexAttribPointer(loc_in_ij, 2, gl.FLOAT, false, 8,0);

    gl.uniform4f(loc_clear_size, 0,0,0,0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuf);
    gl.framebufferTexture2D(
      /*target=*/gl.DRAW_FRAMEBUFFER,
      /*attachment=*/gl.COLOR_ATTACHMENT0,
      /*texTarget=*/gl.TEXTURE_2D,
      /*texture=*/this._cells1,
      /*levelOfDetail=*/0
    );

    // SET READ FROM MATRIX 1
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0,0, this._width+2,this._height+2);
    gl.drawArrays(gl.TRIANGLES, 0,2*3);

    this._time = 0;
  }

  async render( x, y, scale )
  {
    if( 1 < scale ) {
      console.assert( scale%1 === 0 )
      scale |= 0
    }
    const gl = this._gl
    const {width: W, height: H} = this._canvas;
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearBufferfv( gl.COLOR, 0, Float32Array.of(1,1,1,0) )

    const buf_in_ij = this._buf_in_ij;

    // RENDER BLUE BOX AS BOUNDARY
    {
      const program = this._clearProgram
      gl.useProgram(program)
      const loc_in_ij     = gl. getAttribLocation(program, 'in_ij'),
            loc_clear_val = gl.getUniformLocation(program, 'clear_val')

      gl.bindBuffer(gl.ARRAY_BUFFER, buf_in_ij);
      gl.enableVertexAttribArray(loc_in_ij);
      gl.vertexAttribPointer(loc_in_ij, 2, gl.FLOAT, false, 8,0);

      gl.uniform4f(loc_clear_val, 0,0,1,1)

      let border = 4,
              x0 =  x-border,
              y0 = -y-border + H - this._height*scale,
               w = this._width *scale + 2*border,
               h = this._height*scale + 2*border
      if( x0 < 0 ) { w += x0; x0=0 }
      if( y0 < 0 ) { h += y0; y0=0 }
      if( x0+w > W-1 ) w -= x0+w - W+1
      if( y0+h > H-1 ) h -= y0+h - H+1
      gl.viewport(x0,y0, w,h);
      gl.drawArrays(gl.TRIANGLES, 0,2*3)
    }

    // RENDER CONTENT
    {
      const program = this._renderProgram
      gl.useProgram(program)
      const loc_in_ij        = gl. getAttribLocation(program, 'in_ij'),
            loc_screen_offset= gl.getUniformLocation(program, 'screen_offset'),
            loc_screen_size  = gl.getUniformLocation(program, 'screen_size'),
            loc_cell_size    = gl.getUniformLocation(program, 'cell_size'),
            loc_scale        = gl.getUniformLocation(program, 'scale')

      gl.bindBuffer(gl.ARRAY_BUFFER, buf_in_ij);
      gl.enableVertexAttribArray(loc_in_ij);
      gl.vertexAttribPointer(loc_in_ij, 2, gl.FLOAT, false, 2*4,0);

      gl.uniform2f(loc_screen_offset, (this._width*scale + x*2)/W-1, (-this._height*scale - y*2)/H+1)
      gl.uniform2f(loc_screen_size,    this._width*scale       /W,     this._height*scale       /H  )
      gl.uniform2f(loc_cell_size,      this._width,                    this._height                 )
      gl.uniform1f(loc_scale, scale)

      gl.bindTexture(gl.TEXTURE_2D, this._cells1);

      gl.viewport(0,0, W,H);
      gl.drawArrays(gl.TRIANGLES, 0,2*3)
    }

    await this._finish()
  }

  get time() {
    return this._time
  }
}
