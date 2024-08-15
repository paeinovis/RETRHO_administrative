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
from astroplan.plots import plot_airmass, plot_finder_image, plot_sky
from astroquery.simbad import Simbad
from PyQt5.QtWidgets import QComboBox, QMainWindow, QApplication, QPushButton, QWidget, QAction, QVBoxLayout, QLabel, QTabWidget, QInputDialog, QLineEdit, QFileDialog
from PyQt5.QtGui import QIcon
from PyQt5.QtCore import pyqtSlot
import sys

# Warnings imports
from astroquery.simbad.core import NoResultsWarning
from astropy.coordinates.name_resolve import NameResolveError
import astropy.coordinates as coordinates
import warnings
warnings.filterwarnings("ignore", message="Numerical value without unit or explicit format passed to TimeDelta, assuming days")
warnings.filterwarnings("error")
from astroplan import FixedTarget, Observer, TargetAlwaysUpWarning, TargetNeverUpWarning
from pyvo.dal.exceptions import DALFormatError, DALAccessError, DALServiceError, DALQueryError
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

NAME = "Target name**"
RA = "RA**"
DEC = "Dec**"

def eastern(time):
    est = time.to_datetime(timezone=RHO.timezone)
    
    return est.strftime('%H:%M:%S')

# Determines which objects are above horizon
def determine_up(list_objects):
    now = Time.now()                                # Update time
    new_list = []                                   # List of objects with up info

    for obj in list_objects:
        try:
            curr_target = FixedTarget(coordinates.SkyCoord.from_name(obj), name=obj)
        except(NameResolveError):
            continue
        if RHO.target_is_up(now, curr_target):
            new_list.append(obj + " (Up)")       # So user can see if a given object is in the sky
        else:
            new_list.append(obj)
    return new_list

class MainWindow(QMainWindow):

    def __init__(self):
        super().__init__()

        self.setWindowTitle("Planning")

        # Define tabs
        self.tabs = QTabWidget()
        self.tab1 = QWidget()
        self.tab2 = QWidget()
        self.tab3 = QWidget()
        self.tabs.addTab(self.tab1, "Stars from name")
        self.tabs.addTab(self.tab2, "Objects from file")
        self.tabs.addTab(self.tab3, "Custom values")

        self.init_tab_one()
        self.init_tab_two()
        self.init_tab_three()


        # Overall window stuff
        container = QWidget()
        self.setCentralWidget(container)
        self.layout = QVBoxLayout()
        self.layout.addWidget(self.tabs)
        container.setLayout(self.layout)

        width = 450
        height = 500
        self.setMinimumSize(width, height) 

        # Init
        self.get_info_of_obj(self.tab1)
        info = "Name:\nIdentifier:\nUp now:\n\nCoordinates:\nMagnitude V:\n\nRises:\nSets:\n\nAltitude:\nAzimuth:"
        self.tab1.label_info.setText(info)


    # Get info of object and print to label
    def get_info_of_obj(self, tab):
        if self.update(tab) is False:
            tab.label_info.setText("Object not found. Check spelling and try again.")
            return
        now = Time.now()
        # SIMBAD shenanigans to get some relevant info and convert it to hmsdms bc SIMBAD doesn't do that natively anymore???
        info = [tab.result_table["main_id"][0], tab.coords.to_string('hmsdms'), tab.result_table["V"][0]]
        
        alt_az = tab.coords.transform_to(AltAz(obstime=now, location=RHO.location))
        str_alt = str(alt_az.alt)[1:-8] + "s"
        str_az = str(alt_az.az)[1:-8] + "s"

        # Gather relevant info
        str_info = ""
        str_info += "Name: " + tab.current_target_name + "\n"
        str_info += "Identifier: " + info[0] + "\n"
        str_info += "Up now: " + str(RHO.target_is_up(now, tab.current_target))[1:-1] + "\n\n"
        str_info += "Coordinates: " + str(info[1])[2:13] +", " + str(info[1])[22:33] + "\n"      # Cutting off the long decimal points for readibility w/o rounding - we don't need to be THAT precise for calib stars
        str_info += "Magnitude V: " + str(round(float(info[2]), 5)) + "\n\n"
        try: 
            rise_set = [eastern(RHO.target_rise_time(time=now, target=tab.current_target)), eastern(RHO.target_set_time(time=now, target=tab.current_target))]
            str_info += "Rises: " + rise_set[0] + " EST" + "\n"
            str_info += "Sets: " + rise_set[1] + " EST" + "\n\n"
        except (TargetAlwaysUpWarning, TargetNeverUpWarning, AttributeError):
            str_info += "Rises: Does not rise\n"
            str_info += "Sets: Does not set\n\n"
        str_info += "Altitude: " + str_alt + "\n"
        str_info += "Azimuth: " + str_az
        
        # Set label as the string info
        tab.label_info.setText(str_info)
    
    # Plot finder image    
    def plot(self, tab):
        if self.update(tab) is False:
            tab.label_info.setText("Object not found. Check spelling and try again.")
            return
        now = Time.now()
        figure = plt.figure()
        canvas = FigureCanvas(figure)
        ax, hdu = plot_finder_image(tab.current_target, fov_radius=self.fov);
        wcs = WCS(hdu.header)
        title = "Finder image for " + tab.current_target_name + " (FOV = " + str(self.fov) + ")"
        ax.set_title(title)
        figure.add_subplot(ax, projection=wcs)
        title = tab.current_target_name + " Plot"
        canvas.setWindowTitle(title)
        canvas.show();

    # Check input to ensure Valid
    def update(self, tab):
        now = Time.now()                                # Update time
        name = tab.targets_dropdown.currentText()

        if "(Up)" in name:              # Cuts off the (Up) part of the name if the star is indeed up, so SIMBAD can query
            name = name[0:-5]

        result_table = None

        try: 
            result_table = Simbad.query_object(name)[["main_id", "ra", "dec", "V"]]
        except (NoResultsWarning, NameResolveError, DALFormatError, DALAccessError, DALServiceError, DALQueryError):
            return False

        tab.result_table = result_table
        tab.current_target_name = name
        tab.coords = SkyCoord(ra=result_table["ra"], dec=tab.result_table["dec"])
        tab.current_target = FixedTarget(tab.coords, name=name)

        if name not in tab.target_list and name not in tab.targets:
            tab.target_list.insert(0, name)

        tab.targets_dropdown.clear()       
        tab.targets_dropdown.addItems(tab.targets)
        tab.targets_dropdown.setCurrentText(name)

    # Open csv file 
    def open_file_dialog(self):                       # Function from https://pythonspot.com/pyqt5-file-dialog/
        options = QFileDialog.Options()
        options |= QFileDialog.DontUseNativeDialog
        file_name, _ = QFileDialog.getOpenFileName(self,"Choose target list file", "","CSV Files (*.csv)", options=options)
        if file_name:
            self.sheet = pandas.read_csv(file_name)
            self.sheet = self.sheet[self.sheet[RA].str.contains("nan") == False]           # Gets rid of blank rows
            self.tab2.targets = []
            self.tab2.target_list = []
            msg = "Successfully parsed file."
            for i in range(2, len(self.sheet)):
                try: 
                    name = self.sheet[NAME][i];
                    curr_target = FixedTarget(coordinates.SkyCoord.from_name(name), name=name)
                    self.tab2.targets.append(name)
                    self.tab2.target_list.append(name)
                except (NoResultsWarning, ValueError, TypeError):
                    msg = "Error parsing file. Please check template and spelling of targets."
                except (NameResolveError):
                    msg = "Some objects could not be resolved and will not be displayed in the dropdown."
            self.tab2.label_info.setText(msg)
            self.update(self.tab2)
            self.tab2.targets_dropdown.clear()       
            self.tab2.targets_dropdown.addItems(self.tab2.targets)
        else:
            self.sheet = None

    # Change FOV to user input
    def change_fov(self):
        update = "FOV could NOT be updated.\nEnsure that the value entered is a positive floating point number."
        try:
            new_fov = float(self.tab3.fov_input.text())
            if (new_fov > 0):
                self.fov = new_fov * u.arcmin
                update = "Successfully updated FOV to " + str(self.fov) + "."
        except (ValueError):
            pass
        self.tab3.label_info.setText(update)

    # Change RA to user input
    def change_ra(self):
        update = "RA could NOT be updated.\nEnsure that the value entered matches the format."
        try:
            new_ra = self.tab3.ra_input.text()
            coord_str = str(new_ra) + " " + str(self.tab3.dec)
            new_coords = SkyCoord(coord_str, unit=(u.hour, u.deg), frame='icrs')
            self.tab3.coords = new_coords
            self.tab3.ra = new_ra
            update = "Successfully updated RA to " + str(self.tab3.ra) + ".\nCoordinates are now " + self.tab3.coords.to_string(style="hmsdms", sep=":", precision=1) + "."
        except (ValueError):
            pass
        self.tab3.label_info.setText(update)

    # Change dec to user input
    def change_dec(self):
        update = "Dec could NOT be updated.\nEnsure that the value entered matches the format."
        try:
            new_dec = self.tab3.dec_input.text()
            coord_str = str(self.tab3.ra) + " " + str(new_dec)
            new_coords = SkyCoord(coord_str, unit=(u.hour, u.deg), frame='icrs')
            self.tab3.coords = new_coords
            self.tab3.dec = new_dec
            update = "Successfully updated Dec to " + str(self.tab3.dec) + ".\nCoordinates are now " + self.tab3.coords.to_string(style="hmsdms", sep=":", precision=1) + "."
        except (ValueError):
            pass
        self.tab3.label_info.setText(update)

    # Plot finder image based on coordinates
    def plot_coords(self):
        now = Time.now()
        figure = plt.figure()
        canvas = FigureCanvas(figure)
        ax, hdu = plot_finder_image(self.tab3.coords, fov_radius=self.fov);
        wcs = WCS(hdu.header)
        title = "Finder image from coordinates (FOV = " + str(self.fov) + ")"
        ax.set_title(title)
        figure.add_subplot(ax, projection=wcs)
        title = "Plot from Coordinates"
        canvas.setWindowTitle(title)
        canvas.show();


    def init_tab_one(self):
        # Tab 1 objects:

        # Init tab 1 values:
        self.tab1.current_target = None
        self.tab1.current_target_name = None
        self.tab1.coords = None
        self.tab1.result_table = None        

        # List of possible alignment stars - can be changed if desired. 
        # Currently organized by brightest mag V to dimmest
        self.tab1.target_list = ['Antares', 'Arcturus', 'Vega', 'Capella', 'Procyon', 
                            'Altair', 'Aldebaran', 'Spica', 'Fomalhaut', 'Deneb', 
                            'Regulus', 'Dubhe', 'Mirfak', 'Polaris', 'Schedar']

        # Widgets
        self.tab1.targets_dropdown = QComboBox()
        self.tab1.targets = determine_up(self.tab1.target_list)
        self.tab1.targets_dropdown.addItems(self.tab1.targets)
        self.tab1.targets_dropdown.setEditable(True)
        self.tab1.targets_dropdown.setInsertPolicy(QComboBox.InsertAtTop)

        self.tab1.label_info = QLabel()
        self.tab1.label_info.setGeometry(200, 200, 200, 30)

        self.tab1.targets_dropdown_button = QPushButton("Get info")
        self.tab1.targets_dropdown_button.clicked.connect(lambda: self.get_info_of_obj(self.tab1))

        self.tab1.plot_button = QPushButton("Plot")
        self.tab1.plot_button.clicked.connect(lambda: self.plot(self.tab1))

        # Entire tab
        self.tab1.layout = QVBoxLayout()
        self.tab1.layout.addWidget(self.tab1.targets_dropdown)
        self.tab1.layout.addWidget(self.tab1.targets_dropdown_button)
        self.tab1.layout.addWidget(self.tab1.label_info)
        self.tab1.layout.addWidget(self.tab1.plot_button)
        self.tab1.setLayout(self.tab1.layout)
        
    def init_tab_two(self):
                # Tab 2 objects: 

        # Init tab 2 values:
        self.tab2.current_target = None
        self.tab2.current_target_name = None
        self.tab2.coords = None
        self.tab2.result_table = None   

        self.tab2.target_list = [] 
        self.tab2.targets = []
        self.tab2.targets_dropdown = QComboBox()
        self.tab2.targets_dropdown.addItems(self.tab2.targets)

        # Widgets
        self.tab2.label_info = QLabel()
        self.tab2.label_info.setGeometry(200, 200, 200, 30)

        self.tab2.targets_dropdown_button = QPushButton("Get info")
        self.tab2.targets_dropdown_button.clicked.connect(lambda: self.get_info_of_obj(self.tab2))

        self.tab2.plot_button = QPushButton("Plot")
        self.tab2.plot_button.clicked.connect(lambda: self.plot(self.tab2))

        self.tab2.file_upload_button = QPushButton("Upload file")
        self.tab2.file_upload_button.clicked.connect(self.open_file_dialog)

        # Entire tab
        self.tab2.layout = QVBoxLayout()
        self.tab2.layout.addWidget(self.tab2.file_upload_button)
        self.tab2.layout.addWidget(self.tab2.targets_dropdown)
        self.tab2.layout.addWidget(self.tab2.targets_dropdown_button)
        self.tab2.layout.addWidget(self.tab2.label_info)
        self.tab2.layout.addWidget(self.tab2.plot_button)

        self.tab2.setLayout(self.tab2.layout)
    
    def init_tab_three(self):
        # Tab 3 objects:

        # Init tab 3 values:
        self.fov = 15*u.arcmin
        self.tab3.ra = "00:00:00"
        self.tab3.dec = "00:00:00"
        temp_coords = self.tab3.ra + " " + self.tab3.dec
        self.tab3.coords = SkyCoord(temp_coords, unit=(u.hour, u.deg), frame='icrs')

        # Widgets
        self.tab3.fov_input = QLineEdit()
        self.tab3.fov_input_button = QPushButton("Change FOV in arcminutes.")

        self.tab3.label_info = QLabel()
        self.tab3.label_info.setGeometry(200, 200, 200, 30)

        self.tab3.fov_input_button.clicked.connect(self.change_fov)

        self.tab3.ra_input = QLineEdit()
        self.tab3.ra_input_button = QPushButton("Change RA in hh:mm:ss or hh mm ss")
        self.tab3.ra_input_button.clicked.connect(self.change_ra)

        self.tab3.dec_input = QLineEdit()
        self.tab3.dec_input_button = QPushButton("Change dec in deg:mm:ss or deg mm ss")
        self.tab3.dec_input_button.clicked.connect(self.change_dec)

        self.tab3.plot_button = QPushButton("Plot")
        self.tab3.plot_button.clicked.connect(self.plot_coords)

        # Entire tab
        self.tab3.layout = QVBoxLayout()
        self.tab3.layout.addWidget(self.tab3.fov_input)
        self.tab3.layout.addWidget(self.tab3.fov_input_button)
        self.tab3.layout.addWidget(self.tab3.ra_input)
        self.tab3.layout.addWidget(self.tab3.ra_input_button)
        self.tab3.layout.addWidget(self.tab3.dec_input)
        self.tab3.layout.addWidget(self.tab3.dec_input_button)
        self.tab3.layout.addWidget(self.tab3.plot_button)
        self.tab3.layout.addWidget(self.tab3.label_info)

        self.tab3.setLayout(self.tab3.layout)

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
# https://pythonspot.com/pyqt5-tabs/
# https://pythonspot.com/pyqt5-file-dialog/

