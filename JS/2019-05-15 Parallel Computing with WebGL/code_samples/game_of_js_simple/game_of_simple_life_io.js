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

function load_rle( rle )
{
  console.assert( 'string' === typeof 'rle' )

  const result = { name: undefined, cells: [] }

  rle = rle.split(/\r?\n/).map( line => line.trim() )

  for( const line of rle )
  {
    const match = line.match(/^\#\s*N\s+(.+)/)
    if(match) {
      console.assert( result.name === undefined )
      result.name = match[1]
    }
  }

  rle = rle.filter(line => ! line.startsWith('#') )

  if( ! rle[0].match(/^x\s*\=\s*\d+\s*\,\s*y\s*\=\s*\d+(\s*\,\s*rule\s*\=\s*B3\/S23)?$/) )
    throw new Error(`Unsupported rule set: '${rle[0]}'`);

  rle = rle.slice(1)
           .join('')

  if( ! rle.endsWith('!') )
    throw new Error('Invalid RLE ending.')
  rle = rle.slice(0,-1)

  let count= undefined,
      row  = 0,
      col  = 0
  
  for( const token of rle.match(/\d+|b|o|\$|./g) )
    switch(token)
    {
      case '$': row += count || 1
                count = undefined
                col  = 0
                break;
      case 'o': for( let c = col + (count || 1); c-- > col; )
                  result.cells.push([row,c])
      case 'b': col += count || 1;
                count = undefined
                break;
      default:
        count = 1*token
        if( isNaN(count) )
          throw new Error(`Invalid character in RLE: '${token}'.`)
    }

  if( undefined !== count )
    throw new Error('Invalid RLE ending.')

  return result
}

const PATTERNS = [
  load_rle(
`#N Glider
#C Source: http://www.conwaylife.com/wiki/Glider
x = 0, y = 0, rule = B3/S23
bbo$
obo$
boo!`
  ),
  load_rle(
`#N Gosper's glider gun
#C This was the first gun discovered.
#C As its name suggests, it was discovered by Bill Gosper.
x = 36, y = 9, rule = B3/S23
24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4b
obo$10bo5bo7bo$11bo3bo$12b2o!`
  ),
  load_rle(
`#N Zig zag
x = 0, y = 0
obobo$
oboob$
oobbb$
bbbbo$
obooo!`
  ),
  load_rle(
`#N Riley's breeder
#O Mitchell Riley
#C A small MMS breeder, discovered in July 2006.
x = 135, y = 41, rule = B3/S23
133bo$134bo$130bo3bo$131b4o3$130bo$131bo$132bo$132bo$131b2o4$133bo$134bo$130bo3bo$131b4o9$96bo$97bo$93bo3bo$94b4o8$3bo$4bo$o3bo$b4o!`
  ),
  load_rle(
`#N Space filler
x = 49, y = 26
20b3o3b3o$19bobbo3bobbo$4o18bo3bo18b4o$o3bo17bo3bo17bo3bo$o8bo12bo3bo12bo8bo$bobbobboobbo25bobboobbobbo$6bo5bo7b3o3b3o7bo5bo$6bo5bo8bo5bo8bo5bo$6bo5bo8b7o8bo5bo$bobbobboobbobboo4bo7bo4boobbobboobbobbo$o8bo3boo4b11o4boo3bo8bo$o3bo9boo17boo9bo3bo$4o11b19o11b4o$16bobo11bobo$19b11o$19bo9bo$20b9o$24bo$20b3o3b3o$22bo3bo$$21b3ob3o$21b3ob3o$20bobooboobo$20b3o3b3o$21bo5bo!`
  )
]
