'''
This code snipped demonstates how a we can fit a curve through a set of data points.

Created on May 3, 2018

@author: Dirk Toewe
'''
import tensorflow as tf
import numpy as np
import matplotlib.pyplot as plt

# let's generate some synthetic input data using sin + noise
x = np.linspace(-np.pi, +np.pi, 400)
y = 1 + np.sin(x) + np.random.rand( len(x) )*0.2 - 0.1

# let's create four variables that our function is going to depend on
a    = tf.Variable( np.random.rand(4), dtype=tf.float32, trainable=True )
# let's create a placeholder for the function input x
x_in = tf.placeholder(tf.float32, shape=[None])
# let's create the curve function. Feel free to add additional operations (tf.sin, tf.exp, ...)
f = a[0] + a[1]*x_in + a[2]*x_in**2 + a[3]*x_in**3

# since our graph contains variables, we also need a computation that initializes all variables
init_vars = tf.global_variables_initializer()

# Let's create a loss term that is to minimized in order to fit the curve.
# In this case we are simply using a weighted mean-squared error (https://en.wikipedia.org/wiki/Mean_squared_error)
w = tf.abs(x_in)
#w = tf.ones( shape=tf.shape(x_in), dtype=tf.float32 )
loss = tf.reduce_mean( w*(y - f)**2 )

# unfortunately tensorflow only offers simple gradient-descent optimizers out of the box as they work best for nueral networks
opt = tf.train.GradientDescentOptimizer( learning_rate=1e-3 ).minimize(loss)

with tf.Session() as sess:
  sess.run(init_vars)

  # let's run 10000 stepts of gradient descent optimization
  for _ in range(10*1000):
    sess.run(opt, feed_dict={ x_in: x })

  # let's look at the result
  f_out = sess.run(f, feed_dict={ x_in: x })

  plot = plt.subplot()
  plot.scatter(x,y, s=1)
  plot.plot(x,f_out, color='red')
  plt.show()