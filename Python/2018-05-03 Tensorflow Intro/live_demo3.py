'''
This code snipped demonstates how scipy can be used in interaction with tensorflow to perform fast non-linear optimization.

Created on May 3, 2018

@author: Dirk Toewe
'''
import tensorflow as tf
import numpy as np
import matplotlib.pyplot as plt
from scipy.optimize import minimize

# let's generate some synthetic input data using sin + noise
x = np.linspace(-np.pi, +np.pi, 400)
y = 1 + np.sin(x) + np.random.rand( len(x) )*0.2 - 0.1

# let's create four variables that our function is going to depend on
a    = tf.Variable( np.random.rand(4), dtype=tf.float64 )
# let's create a placeholder for the function input x
x_in = tf.placeholder(tf.float64, shape=[None])
# let's create the curve function. Feel free to add additional operations (tf.sin, tf.exp, ...)
f = a[0] + a[1]*x_in + a[2]*x_in**2 + a[3]*x_in**3

# since our graph contains variables, we also need a computation that initializes all variables
init_vars = tf.global_variables_initializer()

# Let's create a loss term that is to minimized in order to fit the curve.
# In this case we are simply using a weighted mean-squared error (https://en.wikipedia.org/wiki/Mean_squared_error)
w = tf.abs(x_in)
#w = tf.constant( np.ones([len(x)]) )
loss = tf.reduce_mean( w*(y - f)**2 )

# in order to get the most performance and precision out of the SciPy minimizer, we use tensorflow to compute the gradients as well
loss_grad, = tf.gradients(loss, [a])

with tf.Session() as sess:
  sess.run(init_vars)

  def fjac( a_val ):
    '''
    Compute the loss value and loss gradient for the given function parameters a.

    Parameters
    ----------
    a_val: np.ndarray
      The values for the function coefficients a, for which the loss and the loss gradient is to be computed.

    Returns
    -------
    loss: float
      The loss.
    loss_grad: np.ndarray
      The loss gradients w.r.t. a where loss_grad[i] = d(loss)/d(a[i])
    '''
    print('a: %s' % a_val)
    # as You can see here the feed_dict can also be used to temporarily overshadow a variable's value
    return sess.run([loss, loss_grad], feed_dict={ x_in: x, a: a_val })

  # using 
  result = minimize(
    fjac, # <- the minimized function
    np.random.rand(4), # <- the starting values for minimization
    jac=True # <- set to True so that SciPy knows, that the optimized function returns both function value and gradient
  )
  print(result.x)
  # let's no assign optimization results to a 
  sess.run( a.assign(result.x) )

  # let's look at the result
  f_out = sess.run(f, feed_dict={ x_in: x })

  plot = plt.subplot()
  plot.scatter(x,y, s=1)
  plot.plot(x,f_out, color='red')
  plt.show()