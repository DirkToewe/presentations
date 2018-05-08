'''
In this first code snippet, a naive image (blur) filter is was implemented using tensorflow.

Created on May 3, 2018

@author: Dirk Toewe
'''
from urllib.request import urlopen

from scipy.misc import imread

import matplotlib.pyplot as plt
import tensorflow as tf


# let's read the image using SciPy as a grayscale image (flatten=True)
with urlopen('https://upload.wikimedia.org/wikipedia/commons/0/06/Kitten_in_Rizal_Park%2C_Manila.jpg') as img_stream:
  img = imread( img_stream, flatten=True )
  plt.imshow(img)
  plt.show()

# let's create the input placeholder for the image. shape=[None,None] allows any two-dimensional inputs
img_in = tf.placeholder(tf.float32, shape=[None,None], name='img_in')

smoothed = img_in

'''
let's create the image filter. The image filter generates a new image
that is 2 colums and 2 rows of pixels smaller than the input image.
Each pixel of the output image is the average of 5 pixels of the input
image: the input pixel and its north, east, south and west neighbors.

Since the effects of such a small filter are barely recognizable, the
filter is repeated 128 times. This repetition has an similar effect to
a gaussian blur as neighbors approximately have an effect of 1/5,
neighbors of neighbors have an effect of 1/5², ...
(see: https://en.wikipedia.org/wiki/Gaussian_blur)

The way it is implemented here, the image filter is added 128 times to
the tensorflow computation graph. This is certainly not the most efficient
way but fast enough for demonstration purposes. Tensorflow supports loops
inside the compuation graph as well. There is also an conv2d operation
that allows for a more efficient and simpler implementation of 2d image
convolution operations.
'''
for _ in range(128):
  smoothed = (
    smoothed[1:-1, 1:-1] +
    smoothed[0:-2, 1:-1] +
    smoothed[2:  , 1:-1] +
    smoothed[1:-1, 0:-2] +
    smoothed[1:-1, 2:  ]
  ) / 5

'''
# this is an alternative implementation using a Tensorflow loop.
# Despite the name Tensorflow while loops are more like a recursive
# function than a normal loop.

_, smoothed = tf.while_loop(
  cond = lambda i,img: i < 128,
  body = lambda i,img: [
    i+1,
    (
      img[1:-1, 1:-1] +
      img[0:-2, 1:-1] +
      img[2:  , 1:-1] +
      img[1:-1, 0:-2] +
      img[1:-1, 2:  ]
    ) / 5
  ],
  loop_vars=[0,img_in] # <- this should rather be called initial input
)
'''

# let's execute the blur filter compuation graph
with tf.Session() as sess:
  img_out = sess.run(smoothed, feed_dict = {img_in: img})
  plt.imshow(img_out)
  plt.show()
