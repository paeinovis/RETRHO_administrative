import astropy
import astroquery
import matplotlib.pyplot as plt
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
import pandas
from astropy.coordinates import AltAz, EarthLocation, SkyCoord
from astropy import units as u
from astropy.wcs import WCS
from astropy.time import Time, TimeDelta
from datetime import datetime
from astroplan import FixedTarget, Observer, TargetAlwaysUpWarning, TargetNeverUpWarning
from astroplan.plots import plot_airmass, plot_finder_image, plot_sky
from astroquery.simbad import Simbad
from PyQt5.QtWidgets import QComboBox, QMainWindow, QApplication, QPushButton, QWidget, QVBoxLayout, QLabel
import sys

# Warnings imports
from astroquery.simbad.core import NoResultsWarning
from astropy.coordinates.name_resolve import NameResolveError
import astropy.coordinates as coordinates
import warnings
warnings.filterwarnings("ignore", message="Numerical value without unit or explicit format passed to TimeDelta, assuming days")
warnings.filterwarnings("error")

# from astropy.utils import iers
# iers.conf.IERS_A_URL = 'ftp://cddis.gsfc.nasa.gov/pub/products/iers/finals2000A.all'
# iers.conf.IERS_A_URL_MIRROR = 'https://datacenter.iers.org/data/9/finals2000A.all'
# from astroplan import download_IERS_A
# download_IERS_A()


RHO = Observer(
    location=coordinates.EarthLocation(lat=29.4001, lon=-82.5862*u.deg, height=23*u.m),
    timezone='US/Eastern',
    name='Rosemary Hill Observatory'
)

Simbad.add_votable_fields("U", "V", "B")

Name = "Target name**"
RA = "RA**"
Dec = "Dec**"

now = Time.now()
now.to_datetime(timezone=RHO.timezone).isoformat()
def eastern(time):
    est = time.to_datetime(timezone=RHO.timezone)
    
    return est.strftime('%H:%M:%S')

# Determines which objects are above horizon
def determine_up(list_objects):
    now = Time.now()                                # Update time
    new_list = []                                   # List of objects with up info

    for obj in list_objects:
        curr_target = FixedTarget(coordinates.SkyCoord.from_name(obj), name=obj)
        if RHO.target_is_up(now, curr_target):
            new_list.append(obj + " (Up)")       # So user can see if a given object is in the sky
        else:
            new_list.append(obj)
    return new_list

class MainWindow(QMainWindow):

    def __init__(self):
        super().__init__()

        self.setWindowTitle("Planning")

        # List of possible alignment stars - can be changed if desired. 
        # Currently organized by brightest mag V to dimmest
        self.object_list = ['Sirius', 'Antares', 'Arcturus', 'Vega', 'Capella', 
                            'Procyon', 'Altair', 'Aldebaran', 'Spica', 'Fomalhaut', 
                            'Deneb', 'Regulus', 'Dubhe', 'Mirfak', 'Polaris', 'Schedar']

        self.objects_dropdown = QComboBox()
        self.objects = determine_up(self.object_list)
        self.objects_dropdown.addItems(self.objects)
        self.objects_dropdown.setEditable(True)
        self.objects_dropdown.setInsertPolicy(QComboBox.InsertAtTop)

        # Init'ing values
        self.current_target = None
        self.current_target_name = None
        self.coords = None
        self.result_table = None        
        self.now = Time.now()    
        self.update()

        self.objects_dropdown_button = QPushButton("Go")
        self.objects_dropdown_button.clicked.connect(self.get_info_of_obj)

        self.coord_info = QLabel()
        self.coord_info.setGeometry(200, 200, 200, 30)

        self.figure = plt.figure()
        self.canvas = FigureCanvas(self.figure)

        self.plot_button = QPushButton("Plot")
        self.plot_button.clicked.connect(self.plot)

        self.layout = QVBoxLayout()
        self.layout.addWidget(self.objects_dropdown)
        self.layout.addWidget(self.objects_dropdown_button)
        self.layout.addWidget(self.coord_info)
        self.layout.addWidget(self.canvas)
        self.layout.addWidget(self.plot_button)

        container = QWidget()
        container.setLayout(self.layout)
        self.setCentralWidget(container)

    def get_info_of_obj(self):
        if self.update() is False:
            return

        # SIMBAD shenanigans to get some relevant info and convert it to hmsdms bc SIMBAD doesn't do that natively anymore???
        info = [self.result_table["main_id"][0], self.coords.to_string('hmsdms'), self.result_table["V"][0]]
        
        alt_az = self.coords.transform_to(AltAz(obstime=now, location=RHO.location))
        str_alt = str(alt_az.alt)[1:-8] + "s"
        str_az = str(alt_az.az)[1:-8] + "s"

        # Gather relevant info
        str_info = ""
        str_info += "Name: " + info[0] + "\n"
        str_info += "Coordinates: " + str(info[1])[2:13] +", " + str(info[1])[22:33] + "\n"      # Cutting off the long decimal points for readibility w/o rounding - we don't need to be THAT precise for calib stars
        str_info += "Magnitude V: " + str(round(float(info[2]), 5)) + "\n"
        try: 
            rise_set = [eastern(RHO.target_rise_time(time=now, target=self.current_target)), eastern(RHO.target_set_time(time=now, target=self.current_target))]
            str_info += "Rises: " + rise_set[0] + " EST" + "\n"
            str_info += "Sets: " + rise_set[1] + " EST" + "\n"
        except (TargetAlwaysUpWarning, TargetNeverUpWarning, AttributeError):
            str_info += "Rises: Does not rise\n"
            str_info += "Sets: Does not set\n"
        str_info += "Altitude: " + str_alt + "\n"
        str_info += "Azimuth: " + str_az + "\n"
        str_info += "Up now: " + str(RHO.target_is_up(now, self.current_target))[1:-1]
        
        # Set label as the string info
        self.coord_info.setText(str_info)
    
    # Plot finder image    
    def plot(self):
        if self.update() is False:
            return

        self.figure.clear()
        ax, hdu = plot_finder_image(self.current_target, fov_radius=15*u.arcmin)
        wcs = WCS(hdu.header)
        title = "Finder image for " + self.current_target_name
        ax.set_title(title)
        self.figure.add_subplot(ax, projection=wcs)
        self.canvas.show();

    def update(self):
        self.now = Time.now()                                # Update time
        name = self.objects_dropdown.currentText()

        if "(Up)" in name:              # Cuts off the (Up) part of the name if the star is indeed up, so SIMBAD can query
            name = name[0:-5]

        result_table = None

        try: 
            result_table = Simbad.query_object(name)[["main_id", "ra", "dec", "V"]]
        except (NoResultsWarning):
            self.coord_info.setText("Object not found. Check spelling and try again.")
            self.figure.clear()
            return False

        self.result_table = result_table
        self.current_target_name = name
        self.coords = SkyCoord(ra=self.result_table["ra"], dec=self.result_table["dec"])
        self.current_target = FixedTarget(self.coords, name=name)

        if name not in self.object_list and name not in self.objects:
            self.object_list.insert(0, name)

        self.objects = determine_up(self.object_list)
        self.objects_dropdown.clear()       
        self.objects_dropdown.addItems(self.objects)
        self.objects_dropdown.setCurrentText(name)


app = QApplication(sys.argv)
w = MainWindow()
w.show()
app.exec_()






# Authors: Triana Almeyda, Cassidy Camera, Hannah Luft, Pae Swanson

# References used (mostly for pyqt tbh):
# https://www.pythonguis.com/docs/qcombobox/
# https://www.geeksforgeeks.org/pyqt5-setting-current-text-in-combobox/
# https://www.geeksforgeeks.org/pyqt5-how-to-add-action-to-a-button/
# https://www.pythonguis.com/docs/qpushbutton/
# https://matplotlib.org/stable/gallery/user_interfaces/embedding_in_qt_sgskip.html
# https://www.geeksforgeeks.org/how-to-embed-matplotlib-graph-in-pyqt5/
# https://docs.astropy.org/en/stable/visualization/wcsaxes/
# https://stackoverflow.com/questions/72568050/plotting-a-chart-inside-a-pyqt-gui