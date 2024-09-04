import matplotlib.pyplot as plt
from astropy.time import Time
from astroplan.plots import plot_airmass
import astropy.coordinates as coordinates
from astroplan import FixedTarget, Observer
from astropy import units as u

target = FixedTarget(coordinates.SkyCoord.from_name("Vega"), name="Vega")
observe_time = Time.now()

observer = Observer(
    location=coordinates.EarthLocation(lat=29.4001, lon=-82.5862*u.deg, height=23*u.m),
    timezone='US/Eastern',
    name='Rosemary Hill Observatory'
)


figure = plt.figure()
ax = plot_airmass(target, observer, observe_time, brightness_shading=True)
title = "Finder image for test"
ax.set_title(title)
figure.add_subplot(ax)
title = "Plot"
plt.show()