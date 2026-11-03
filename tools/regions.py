"""Hands and feet of the normalised David (height 1, y up, facing +z), as boxes."""
import numpy as np
def region(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    feet = (y > 0.045) & (y < 0.11)
    right_hand = (x < -0.135) & (y > 0.38) & (y < 0.54)                       # hanging by the thigh
    left_hand = (x > -0.01) & (x < 0.09) & (y > 0.75) & (y < 0.87) & (z > 0.01)  # at the shoulder, on the sling
    return feet | right_hand | left_hand
