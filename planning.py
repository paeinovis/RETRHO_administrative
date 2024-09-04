import astropy
import astroquery
import matplotlib.pyplot as plt
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
import pandas
from astropy.coordinates import AltAz, EarthLocation, SkyCoord
from astropy import units as u
from astropy.wcs import WCS
from astropy.time import Time
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
warnings.filterwarnings("ignore", message="The plot_date function was deprecated in Matplotlib 3.9 and will be removed in 3.11. Use plot instead.")
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

NAME = "Primary Identifier**"
RA = "RA**"
DEC = "Dec**"

def eastern(time):
    est = time.to_datetime(timezone=RHO.timezone)
    return est.strftime('%H:%M:%S')

# Determines which objects are above horizon
def determine_up(targets, obj_names):
    if not targets:
        return
    
    now = Time.now()                                # Update time
    new_list = []                                   # List of objects with up info
    index = 0

    for obj in targets:
        obj_name = obj_names[index]
        if "(Up)" in obj_name:                        # Cuts off the (Up) part of the name if the star is indeed up
            obj_name = obj_name[0:-5]
        if RHO.target_is_up(now, obj):
            new_list.append(obj_name + " (Up)")       # So user can see if a given object is in the sky
        else:
            new_list.append(obj_name)
        index += 1
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
        self.init_tab_one()
        self.init_tab_two()
        self.init_tab_three()
        self.fov = 15*u.arcmin

        info = "Name:\nIdentifier:\nUp now:\n\nCoordinates:\nMagnitude V:\n\nRises:\nSets:\n\nAltitude:\nAzimuth:"
        self.tab1.label_info.setText(info)       

    # Get info of object and print to label
    def get_info_of_obj(self, tab):
        if tab.target_names is not None:
            if not self.update(tab):
                return
        try: 
            result_table = Simbad.query_object(tab.current_target_name)[["main_id", "ra", "dec", "V"]]
            tab.coords = SkyCoord(ra=result_table["ra"], dec=result_table["dec"])
        except (NoResultsWarning, NameResolveError, DALFormatError, DALAccessError, DALServiceError, DALQueryError, AttributeError):
            tab.label_info.setText("Object not found. Check spelling and try again.")
            return
        
        tab.result_table = result_table
        now = Time.now()

        # SIMBAD shenanigans to get some relevant info and convert it to hmsdms bc SIMBAD doesn't do that natively anymore???
        info = [tab.result_table["main_id"][0], tab.coords.to_string('hmsdms'), tab.result_table["V"][0]]

        # Cutting off the long decimal points for readibility w/o rounding - we don't need to be That precise
        if "." in str(info[1]) and " " in str(info[1]):
            coords_str = str(info[1]).split(".")
            coords_2 = coords_str[1].split(" ")
            coords_ra = coords_str[0][2:] + "." + coords_2[0][:2] + "s"
            coords_dec = coords_2[1][:] + "." + coords_str[2][:2] + "s"
        # In the unlikely event they're not separated in the way I'm expecting .
        else:                        
            coords_ra = result_table["ra"]
            coords_dec = result_table["dec"]

        # Idk what to say abt this, sometimes the true/false comes like [True] and other times it comes like True. I don't get it .
        up_now = str(RHO.target_is_up(now, tab.current_target))
        if "[" in up_now:
            up_now = up_now.split("[")[1]
            up_now = up_now.split("]")[0]

        alt_az = tab.coords.transform_to(AltAz(obstime=now, location=RHO.location))
        str_alt = str(alt_az.alt)[1:-8] + "s"
        str_az = str(alt_az.az)[1:-8] + "s"

        # Gather relevant info
        str_info = ""
        str_info += "Name: " + tab.current_target_name + "\n"
        str_info += "Identifier: " + info[0] + "\n"
        str_info += "Up now: " + up_now + "\n\n"
        str_info += "Coordinates: " + coords_ra + ", " + coords_dec + "\n"      
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
        if tab.target_names is not None:
            if not self.update(tab):
                return
                
        try: 
            result_table = Simbad.query_object(tab.current_target_name)[["main_id", "ra", "dec", "V"]]
        except (NoResultsWarning, NameResolveError, DALFormatError, DALAccessError, DALServiceError, DALQueryError):
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

    # Plot airmass
    def airmass_plot(self, tab):        
        now = Time.now()
        figure = plt.figure(figsize=(8, 6))
        ax = plot_airmass(tab.current_target, RHO, now)
        # Genuinely idk why I can't do things normally here e.g. can't do brightness_shading=True without it running into a conversion error but. whatever.
        title = "Airmass plot for " + tab.current_target_name
        ax.set_title(title)
        figure.add_subplot(ax)
        title = tab.current_target_name + " Airmass Plot"
        canvas = FigureCanvas(figure)
        canvas.setWindowTitle(title)
        canvas.show();

        
    # Update values of dropdown menu
    def update(self, tab):
        name = tab.targets_dropdown.currentText()
        if name == '':
            tab.label_info.setText("Could not complete action. Ensure a target is uploaded and selected.")
            return False
        
        if name in tab.target_names:
            index_of_name = tab.target_names.index(name)
        if "(Up)" in name:              # Cuts off the (Up) part of the name if the star is indeed up, so SIMBAD can query
            name = name[0:-5]
        tab.current_target_name = name

        if tab is self.tab2:
            tab.current_target = tab.targets[index_of_name]
            tab.coords = SkyCoord(ra=tab.current_target.ra, dec=tab.current_target.dec)
            tab.targets_dropdown.clear()       
            tab.targets_dropdown.addItems(tab.target_names)
            now = Time.now()                                # Update time
            if RHO.target_is_up(now, tab.current_target):
                name = name + " (Up)"      
            tab.targets_dropdown.setCurrentText(name)
            return True
        
        try: 
            result_table = Simbad.query_object(tab.current_target_name)[["main_id", "ra", "dec", "V"]]
            tab.result_table = result_table
            tab.coords = SkyCoord(ra=result_table["ra"], dec=tab.result_table["dec"])
            if name not in tab.target_names:
                tab.current_target = FixedTarget(tab.coords, name=name)
                tab.targets.append(tab.current_target)
                now = Time.now()                                # Update time
                if RHO.target_is_up(now, tab.current_target):
                    name = name + " (Up)"      
                tab.target_names.insert(0, name)
        except (NoResultsWarning, NameResolveError, DALFormatError, DALAccessError, DALServiceError, DALQueryError, AttributeError):
            pass

        tab.targets_dropdown.clear()       
        tab.targets_dropdown.addItems(tab.target_names)
        tab.targets_dropdown.setCurrentText(name)
        return True

    # Open csv file 
    def open_file_dialog(self):                       # Function from https://pythonspot.com/pyqt5-file-dialog/
        options = QFileDialog.Options()
        options |= QFileDialog.DontUseNativeDialog
        file_name, _ = QFileDialog.getOpenFileName(self,"Choose target list file", "","CSV Files (*.csv)", options=options)
        if file_name:
            self.sheet = pandas.read_csv(file_name)
            self.sheet = self.sheet[self.sheet[RA].str.contains("nan") == False]           # Gets rid of blank rows
            self.tab2.targets = []
            self.tab2.target_names = []
            msg = "Successfully parsed file."
            for i in range(2, len(self.sheet)):
                try: 
                    name = self.sheet[NAME][i]
                    curr_target = FixedTarget(coordinates.SkyCoord.from_name(name), name=name)
                    self.tab2.targets.append(curr_target)
                    self.tab2.target_names.append(name)
                except (NoResultsWarning, ValueError, TypeError):
                    msg = "Error parsing file. Please check template of submitted sheet."
                except (NameResolveError):
                    name = self.sheet[NAME][i] 
                    curr_coords = self.sheet[RA][i] + " " + self.sheet[DEC][i]
                    curr_coords = SkyCoord(curr_coords, unit=(u.hour, u.deg), frame='icrs')
                    curr_target = FixedTarget(curr_coords, name=name)
                    self.tab2.targets.append(curr_target)
                    self.tab2.target_names.append(name)
            self.tab2.label_info.setText(msg)
            self.tab2.target_names = determine_up(self.tab2.targets, self.tab2.target_names)
            self.tab2.targets_dropdown.clear()       
            self.tab2.targets_dropdown.addItems(self.tab2.target_names)
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
            coord_str_1 = str(new_ra) 
            coord_str_2 = str(self.tab3.dec)
            new_coords = SkyCoord(coord_str_1, coord_str_2, unit=(u.hour, u.deg), frame='icrs')
            self.tab3.coords = new_coords
            self.tab3.ra = new_ra
            update = "Successfully updated RA to " + str(self.tab3.ra) + ".\nCoordinates are now " + self.tab3.coords.to_string(style="hmsdms", sep=":", precision=1) + "."
        except (ValueError):
            pass
        self.tab3.label_info.setText(update)

    # Change Dec to user input
    def change_dec(self):
        update = "Dec could NOT be updated.\nEnsure that the value entered matches the format."
        try:
            new_dec = self.tab3.dec_input.text()
            coord_str_1 = str(self.tab3.ra) 
            coord_str_2 = str(new_dec)
            new_coords = SkyCoord(coord_str_1, coord_str_2, unit=(u.hour, u.deg), frame='icrs')
            self.tab3.coords = new_coords
            self.tab3.dec = new_dec
            update = "Successfully updated Dec to " + str(self.tab3.dec) + ".\nCoordinates are now " + self.tab3.coords.to_string(style="hmsdms", sep=":", precision=1) + "."
        except (ValueError):
            pass
        self.tab3.label_info.setText(update)

    # Plot finder image based on coordinates
    def plot_coords(self, tab):
        if tab is self.tab3:
            title = "Finder image from coordinates (FOV = " + str(self.fov) + ")"
            title_2 = "Plot From Coordinates"
        elif tab is self.tab2:
            name = tab.targets_dropdown.currentText()
            if name == '':
                tab.label_info.setText("Could not complete action. Ensure a target is uploaded and selected.")
                return False
            self.update(tab)
            title = "Finder image for " + tab.current_target_name + " (FOV = " + str(self.fov) + ")"
            title_2 = tab.current_target_name + " Plot"
        now = Time.now()
        figure = plt.figure()
        canvas = FigureCanvas(figure)
        ax, hdu = plot_finder_image(tab.coords, fov_radius=self.fov);
        wcs = WCS(hdu.header)
        ax.set_title(title)
        figure.add_subplot(ax, projection=wcs)
        canvas.setWindowTitle(title_2)
        canvas.show();

    def init_tab_one(self):
        # Tab 1 objects:

        # Init tab 1 values:
        self.tab1.coords = SkyCoord("00:00:00.00 00:00:00.00", unit=(u.hour, u.deg), frame='icrs')
        self.tab1.current_target = FixedTarget(self.tab1.coords, name="Default Coordinates Plot")
        self.tab1.current_target_name = "Default"

        # List of possible alignment stars - can be changed if desired. 
        # Currently organized by brightest mag V to dimmest
        temp_target_names = ['Antares', 'Arcturus', 'Vega', 'Capella', 'Procyon',
                            'Altair', 'Aldebaran', 'Spica', 'Fomalhaut', 'Deneb', 
                            'Regulus', 'Dubhe', 'Mirfak', 'Polaris', 'Schedar',
                            'Kappa Oph', '* b03 Cyg' '* g Her', '* 49 Cas']
        self.tab1.target_names = []
        self.tab1.targets = []

        now = Time.now()
        for star in temp_target_names:
            try:
                curr_target = FixedTarget(coordinates.SkyCoord.from_name(star), name=star)
            except(NameResolveError):
                continue
            if RHO.target_is_up(now, curr_target):
                self.tab1.target_names.append(star + " (Up)")       # So user can see if a given object is in the sky
                self.tab1.targets.append(curr_target)
            else:
                self.tab1.target_names.append(star)
                self.tab1.targets.append(curr_target)


        # Widgets
        self.tab1.targets_dropdown = QComboBox()
        self.tab1.targets_dropdown.addItems(self.tab1.target_names)
        self.tab1.targets_dropdown.setEditable(True)
        self.tab1.targets_dropdown.setInsertPolicy(QComboBox.InsertAtTop)

        self.tab1.label_info = QLabel()
        self.tab1.label_info.setGeometry(200, 200, 200, 30)

        self.tab1.targets_dropdown_button = QPushButton("Get info")
        self.tab1.targets_dropdown_button.clicked.connect(lambda: self.get_info_of_obj(self.tab1))

        self.tab1.plot_button = QPushButton("Plot")
        self.tab1.plot_button.clicked.connect(lambda: self.plot(self.tab1))

        self.tab1.update_button = QPushButton("Update Targets Up Status")
        self.tab1.update_button.clicked.connect(lambda: determine_up(self.tab1.targets, self.tab1.target_names))

        self.tab1.plot_airmass_button = QPushButton("Plot airmass")
        self.tab1.plot_airmass_button.clicked.connect(lambda: self.airmass_plot(self.tab1))

        # Entire tab
        self.tab1.layout = QVBoxLayout()
        self.tab1.layout.addWidget(self.tab1.targets_dropdown)
        self.tab1.layout.addWidget(self.tab1.targets_dropdown_button)
        self.tab1.layout.addWidget(self.tab1.label_info)
        self.tab1.layout.addWidget(self.tab1.plot_button)
        self.tab1.layout.addWidget(self.tab1.update_button)
        self.tab1.layout.addWidget(self.tab1.plot_airmass_button)
        self.tab1.setLayout(self.tab1.layout)
        
    def init_tab_two(self):
        # Tab 2 objects: 

        # Init tab 2 values:
        self.tab2.coords = SkyCoord("00:00:00.00 00:00:00.00", unit=(u.hour, u.deg), frame='icrs')
        self.tab2.current_target = FixedTarget(self.tab2.coords, name="Default Coordinates Plot")
        self.tab2.current_target_name = "Default"
        self.tab2.result_table = None   

        self.tab2.target_names = [] 
        self.tab2.targets = []
        self.tab2.targets_dropdown = QComboBox()
        self.tab2.targets_dropdown.addItems(self.tab2.target_names)

        # Widgets
        self.tab2.label_info = QLabel()
        self.tab2.label_info.setGeometry(200, 200, 200, 30)

        self.tab2.targets_dropdown_button = QPushButton("Get info")
        self.tab2.targets_dropdown_button.clicked.connect(lambda: self.get_info_of_obj(self.tab2))

        self.tab2.plot_button = QPushButton("Plot")
        self.tab2.plot_button.clicked.connect(lambda: self.plot_coords(self.tab2))

        self.tab2.plot_airmass_button = QPushButton("Plot airmass")
        self.tab2.plot_airmass_button.clicked.connect(lambda: self.airmass_plot(self.tab2))

        self.tab2.update_button = QPushButton("Update Targets Up Status")
        self.tab2.update_button.clicked.connect(lambda: determine_up(self.tab2.targets, self.tab2.target_names))

        self.tab2.file_upload_button = QPushButton("Upload file")
        self.tab2.file_upload_button.clicked.connect(self.open_file_dialog)

        # Entire tab
        self.tab2.layout = QVBoxLayout()
        self.tab2.layout.addWidget(self.tab2.file_upload_button)
        self.tab2.layout.addWidget(self.tab2.targets_dropdown)
        self.tab2.layout.addWidget(self.tab2.targets_dropdown_button)
        self.tab2.layout.addWidget(self.tab2.label_info)
        self.tab2.layout.addWidget(self.tab2.plot_button)
        self.tab2.layout.addWidget(self.tab2.plot_airmass_button)
        self.tab2.layout.addWidget(self.tab2.update_button)
        
        self.tab2.setLayout(self.tab2.layout)
    
    def init_tab_three(self):
        # Tab 3 objects:

        # Init tab 3 values:
        self.tab3.ra = "00:00:00.00"
        self.tab3.dec = "00:00:00.00"
        temp_coords = self.tab3.ra + " " + self.tab3.dec
        self.tab3.coords = SkyCoord(temp_coords, unit=(u.hour, u.deg), frame='icrs')
        self.tab3.current_target = FixedTarget(self.tab3.coords, name="Default Coordinates Plot")
        self.tab3.current_target_name = "Fixed Coordinates"

        # Widgets
        self.tab3.fov_input = QLineEdit()
        self.tab3.fov_input_button = QPushButton("Change FOV in arcminutes.")

        self.tab3.label_info = QLabel()
        self.tab3.label_info.setGeometry(200, 200, 200, 30)

        self.tab3.fov_input_button.clicked.connect(self.change_fov)

        self.tab3.ra_input = QLineEdit()
        self.tab3.ra_input_button = QPushButton("Change RA in hh:mm:ss or hh mm ss.")
        self.tab3.ra_input_button.clicked.connect(self.change_ra)

        self.tab3.dec_input = QLineEdit()
        self.tab3.dec_input_button = QPushButton("Change Dec in deg:mm:ss or deg mm ss.")
        self.tab3.dec_input_button.clicked.connect(self.change_dec)

        self.tab3.plot_button = QPushButton("Plot")
        self.tab3.plot_button.clicked.connect(lambda: self.plot_coords(self.tab3))

        self.tab3.plot_airmass_button = QPushButton("Plot airmass")
        self.tab3.plot_airmass_button.clicked.connect(lambda: self.airmass_plot(self.tab3))

        # Entire tab
        self.tab3.layout = QVBoxLayout()
        self.tab3.layout.addWidget(self.tab3.fov_input)
        self.tab3.layout.addWidget(self.tab3.fov_input_button)
        self.tab3.layout.addWidget(self.tab3.ra_input)
        self.tab3.layout.addWidget(self.tab3.ra_input_button)
        self.tab3.layout.addWidget(self.tab3.dec_input)
        self.tab3.layout.addWidget(self.tab3.dec_input_button)
        self.tab3.layout.addWidget(self.tab3.plot_button)
        self.tab3.layout.addWidget(self.tab3.plot_airmass_button)
        self.tab3.layout.addWidget(self.tab3.label_info)

        self.tab3.setLayout(self.tab3.layout)

app = QApplication(sys.argv)
w = MainWindow()
w.show()
app.exec_()






# Authors: Pae Swanson, Triana Almeyda, Cassidy Camera, Hannah Luft

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

