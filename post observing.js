var sheet = SpreadsheetApp.getActiveSpreadsheet();
var sheet_history = sheet.getSheetByName("History");
var sheet_followup = sheet.getSheetByName("Followup");

var obs_num = sheet_history.getLastColumn() - 1;

var observers_list = [];

// Class for us observers
class Observer {
  constructor(name, nights_obs, num_nights_obs, num_nights_missed) {
    this.name = name;
    this.nights_obs = nights_obs;
    this.num_nights_obs = num_nights_obs;
    this.num_nights_missed = num_nights_missed;
  }
}

// Gathers data from History sheet and creates observer objects with it, then puts them in a list
// This function works as main(); if debugging, start from initObservers
function initObservers() {
  var observers_names = sheet_history.getSheetValues(1, 2, 1, obs_num);
  var observers_num_nights_obs = sheet_history.getSheetValues(2, 2, 1, obs_num);
  var observers_num_nights_missed = sheet_history.getSheetValues(3, 2, 1, obs_num);

  for (let i = 0; i < obs_num; i++) {
    var obs_name = observers_names[0][i];
    var obs_num_nights_obs = observers_num_nights_obs[0][i];
    var obs_num_nights_missed = observers_num_nights_missed[0][i];
    var obs_nights_obs = sheet_history.getSheetValues(4, i + 2, obs_num_nights_obs + obs_num_nights_missed, 1); // Get list of all nights observed (or not)

    var obs = new Observer(obs_name, obs_nights_obs, obs_num_nights_obs, obs_num_nights_missed);
    observers_list.push(obs);
  }
  parseFollowup(observers_names);
}


function parseFollowup(obs_names) {
  sortBySubmission();
  var latest_entry_name = sheet_followup.getSheetValues(2, 2, 1, 1)[0][0];
  var latest_night_obs = sheet_followup.getSheetValues(2, 3, 1, 1)[0][0];
  var obs_exists = obs_names[0].includes(latest_entry_name);
  if (obs_exists) {                                                           // If existing observer
    let curr_obs = observers_list.find(o => o.name === latest_entry_name);    
    for (let i = 0; i < curr_obs.num_nights_obs; i++) {                       // Block person from registering same night twice
      var curr = curr_obs.nights_obs[i][0].toString();
      if (curr.localeCompare(latest_night_obs) === 0) { return; }
    }
    let index = observers_list.indexOf(curr_obs) + 2;
    if (sheet_followup.getSheetValues(2, 4, 1, 1)[0][0] == "Yes") {           // If they actually observed
      // If person observed, update values
      curr_obs.num_nights_obs++;
      updateHistVals(curr_obs, index, latest_night_obs, false);
    }
    else if (sheet_followup.getSheetValues(2, 4, 1, 1)[0][0] == "No (Unexcused)") {     // If absent
      curr_obs.num_nights_missed++;
      updateHistVals(curr_obs, index, latest_night_obs, true);  
    }
    // If someone missed and had an excused absence, don't bother adding/changing anything
  }
  else {                                                                      // If nonexisting observer
    var obs;
    if (sheet_followup.getSheetValues(2, 4, 1, 1)[0][0] == "Yes") {           // If person observed, update values and add to observer list 
      var latest_num_nights_obs = 1;
      var latest_num_nights_missed = 0;
      obs = new Observer(latest_entry_name, latest_night_obs, latest_num_nights_obs, latest_num_nights_missed);
      obs_num++;
      updateHistVals(obs, obs_num + 1, latest_night_obs, false);
    }
    else if (sheet_followup.getSheetValues(2, 4, 1, 1)[0][0] == "No (Unexcused)") {     // If absent
      var latest_num_nights_obs = 0;
      var latest_num_nights_missed = 1;
      obs = new Observer(latest_entry_name, latest_night_obs, latest_num_nights_obs, latest_num_nights_missed);
      obs_num++;
      updateHistVals(obs, obs_num + 1, latest_night_obs, true);
    }
    // If someone missed and had never observed before but absence was excused, don't bother adding/changing anything
  }
}

// This sorts the dates forms submitted in the Followup sheet, with the most recent submission on top
function sortBySubmission() {
  sheet_followup.sort(1, false);
}

function updateHistVals(observer, index, latest_night_obs, absent) {          // Sets the cells
  var color = "black";
  if (absent) {         // Red font = absent !
    color = "red";
  }
  sheet_history.getRange(1, index, 1, 1).setValue(observer.name).setFontColor('black');
  sheet_history.getRange(2, index, 1, 1).setValue(observer.num_nights_obs).setFontColor('black');
  sheet_history.getRange(3, index, 1, 1).setValue(observer.num_nights_missed).setFontColor('black');
  sheet_history.getRange(4 + observer.num_nights_obs + observer.num_nights_missed - 1, index, 1, 1).setValue(latest_night_obs).setFontColor(color);
}


// Author: Pae Swanson


// Snippets used/referenced:
// https://stackoverflow.com/questions/42912227/how-to-add-data-to-a-specific-row-in-google-sheets-using-google-script
// https://stackoverflow.com/questions/12462318/find-a-value-in-an-array-of-objects-in-javascript