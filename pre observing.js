var sheet = SpreadsheetApp.getActiveSpreadsheet();
var sheet_schedule = sheet.getSheetByName("Schedule");    // I realize Java style for vars is probably camelcase . but I like Python
var sheet_signup = sheet.getSheetByName("Signup");

var days_num = sheet_schedule.getLastRow() - 1;

var days_list = [];

const MAX_OBS = 5;

var calendar = CalendarApp.getCalendarById("c180b8fc16923af0732b2d4a46a878a9066c78bcf6b302066acd636def2de972@group.calendar.google.com");

// Class for days
class ScheduledDay {
  constructor(day, num_obs, obs_list) {
    this.day = day;
    this.num_obs = num_obs;
    this.obs_list = obs_list;
  }
}

// Gathers data from Schedule sheet and creates day objects with it, then puts them in a list
// This function works as main(); if debugging, start from initDays
function initDays() {
  var days = sheet_schedule.getSheetValues(2, 1, days_num, 1);
  var num_obs = sheet_schedule.getSheetValues(2, 2, days_num, 1);

  for (let i = 0; i < days_num; i++) {
    var curr_day = days[i][0];
    var curr_num_obs = num_obs[i][0];
    var curr_obs_list = sheet_schedule.getSheetValues(i + 2, 3, 1, curr_num_obs);    // Get list of all signed up observers

    var day = new ScheduledDay(curr_day, curr_num_obs, curr_obs_list);
    days_list.push(day);
  }
  parseSignup(days);
}


function parseSignup(days) {
  sortBySubmission();

  // Grab latest submission values
  var latest_entry_name = sheet_signup.getSheetValues(2, 2, 1, 1)[0][0];
  var latest_night_obs = sheet_signup.getSheetValues(2, 3, 1, 1)[0][0];
  var latest_entry_email = sheet_signup.getSheetValues(2, 4, 1, 1)[0][0];
  var latest_entry_exp = sheet_signup.getSheetValues(2, 5, 1, 1)[0][0];
  
  let email_date = latest_night_obs.toString().substring(0, 15);

  var color;
  if (latest_entry_exp === "Senior") { color = 'blue'; }
  else if (latest_entry_exp === "Junior") { color = 'orange'; }

  var arr = checkDuplicateDays(days, latest_night_obs);
  if (arr[0]) {                                                                 // If day is already on schedule, don't re-add. Only add name
    let curr_day = days_list[arr[1]];
    var curr_num_obs = curr_day.num_obs;
    
    if (curr_num_obs == MAX_OBS) {                                              // If obs night is capped, do not add.
      sendFollowupEmail(latest_entry_name, email_date, latest_entry_email, false);
      return;
    }

    var curr_obs_list = curr_day.obs_list;

    let index = days_list.indexOf(curr_day) + 2;                                // Row to list new observer
    let index2 = 3 + curr_day.num_obs;                                          // Column to list new observer
    var arr2 = checkDuplicateName(curr_obs_list, latest_entry_name);
    if (arr2[0]) {                                                              // If name already on list, do not add
      sendFollowupEmail(latest_entry_name, email_date, latest_entry_email, false);
      sortBySoonest(days);
      return;   
    }                                                    
    sheet_schedule.getRange(index, index2, 1, 1).setValue(latest_entry_name).setFontColor(color);   
    // Else add name to end of list
    var curr_num_obs = curr_day.num_obs;
    curr_num_obs++;                                                             // Add 1 to number of observers
    sheet_schedule.getRange(index, 2, 1, 1).setValue(curr_num_obs);             // Add above value to sheet
  }
  else {                                                                        // If first observer for a new date
    var index = days_num + 2;
    sheet_schedule.getRange(index, 1, 1, 1).setValue(latest_night_obs);              // Set date to entry date
    sheet_schedule.getRange(index, 2, 1, 1).setValue(1);                             // Set number of observers to 1
    sheet_schedule.getRange(index, 3, 1, 1).setValue(latest_entry_name).setFontColor(color);          
    // Set first observer to entry name

    let cal_add = latest_night_obs.toString();
    updateCalendar(cal_add);       // New date for observing, add to calendar.
  }
  sortBySoonest();    // Re-sort after adding
  sendFollowupEmail(latest_entry_name, email_date, latest_entry_email, true);
}

// This sorts the dates forms submitted in the Signup sheet, with the most recent submission on top
function sortBySubmission() {
  sheet_signup.sort(1, false);
}

// This sorts the dates in the Schedule sheet, with the most recent date on top
function sortBySoonest() {
  sheet_schedule.sort(1, false);
}

function checkDuplicateDays(days, day_name) {
  for (let i = 0; i < days.length; i++) {
    var curr = days[i][0].toString();
    if (curr.localeCompare(day_name) === 0) {
      var arr = [true, i];
      return arr;
    }
  }
  var arr = [false, -1];
  return arr;
}

function checkDuplicateName(listComp, indivComp) {
  for (let i = 0; i < listComp[0].length; i++) {
    var curr = listComp[0][i].toString();
    if (curr.localeCompare(indivComp) === 0) {
      var arr = [true, i];
      return arr;
    }
  }
  var arr = [false, -1];
  return arr;
}


function sendFollowupEmail(name, date, email, success) {
  let text = "here";
  let followup_form_link = text.link("https://forms.gle/uho4GmKyziWcE3r86");
  let signup_form_link = text.link("https://forms.gle/Tf1zrxuVezn6nU5c8");
  let signup_sheet_link = text.link("https://docs.google.com/spreadsheets/d/1r_Dt8ZNdDHkeHi25e36xfJpojqJLoxDwxNC4BB9Y4Sw/edit?usp=sharing");

  var subj;
  var message;

  if (success) {
    subj = "[SUCCESS] - RETRHO Observing Schedule Updated";
    message = "Dear " + name + ",<br/><br/>" + 
    "Your request to be added to the observing schedule for the date <b>" + date + "</b> has successfully been processed." +
    "<br/><br/>Please check the observing signup Google sheet <b>" + signup_sheet_link + "</b> to ensure the information you entered was correct. If there was an error in your submission, please reply to this email to update it." + 
    "<br/><br/>Please remember to complete the followup Google form to keep track of your observing history.<br/><b> The followup form can be found " + followup_form_link + "</b>." +
    "<br/><br/>Thank you for using the RETRHO interface.";
  }
  else {
    subj = "[ERROR] - RETRHO Observing Schedule Not Updated";
    message = "Dear " + name + ",<br/><br/>" + 
    "Your request to be added to the observing schedule for the date <b>" + date + "</b> has <b>NOT</b> been successfully processed. Please retry submission through the signup Google form." + 
    "<br/><br/> <b>The signup form can be found " + signup_form_link + "</b>." + 
    "<br/><br/> Note that only 5 observers can observe a night, so if there are 5 people already signed up, you will not be able to observe on that night. Alternatively, you may already be signed up. Please check the signup sheet " + signup_sheet_link + " before trying again." +
    "<br/><br/>Thank you for using the RETRHO interface.";    
  }
  MailApp.sendEmail({
    to: email, 
    subject: subj, 
    htmlBody: message});
};


function updateCalendar(date_to_obs) {            // Take date and parse info to determine start and end dates
  var month = date_to_obs.substr(4,3);
  var num_day = date_to_obs.substr(8, 2);
  var year = date_to_obs.substr(11, 4);
  var sunset_string = month + " " + num_day + " " + year + " ";
  var sunrise_string = "";

  switch(month) {
    case "Jan": {
      sunset_string += "18:20:00";
      sunrise_string += "06:00:00";
      break;
    }
    case "Feb": {
      sunset_string += "18:40:00";
      sunrise_string += "05:50:00";
      break;
    }
    case "Mar": {
      var jan_string = "January 1, " + year + " 01:00:00";
      var jan = new Date(jan_string);
      jan_string = jan.toString();

      var test_string = month + " " + num_day + ", " + year + " 18:00:00";
      var test_day = new Date(test_string);
      test_string = test_day.toString();

      if (jan_string[30] == test_string[30]) {           // If init day is in same state of DST as earlier year
        sunset_string += "18:50:00";    
        sunrise_string += "05:30:00";                                                                
      }
      else {      
        sunset_string += "20:00:00";
        sunrise_string += "06:10:00";
      }
      break;
    }
    case "Apr": {
      sunset_string += "20:20:00";
      sunrise_string += "05:40:00";
      break;
    }
    case "May": { 
      sunset_string += "20:40:00";
      sunrise_string += "05:00:00";     
      break;
    }
    case "Jun": {
      sunset_string += "21:00:00";
      sunrise_string += "04:50:00";
      break;
    }
    case "Jul": {
      sunset_string += "21:00:00";
      sunrise_string += "05:00:00";
      break;
    }
    case "Aug": {
      sunset_string += "20:30:00";
      sunrise_string += "05:30:00";
      break;
    }
    case "Sep": {
      sunset_string += "19:50:00";
      sunrise_string += "05:50:00";
      break;
    }
    case "Oct": {
      sunset_string += "19:20:00";
      sunrise_string += "06:10:00";
      break;
    }
    case "Nov": {
      var jan_string = "January 1, " + year + " 01:00:00";
      var jan = new Date(jan_string);
      jan_string = jan.toString();

      var test_string = month + " " + num_day + ", " + year + " 18:00:00";
      var test_day = new Date(test_string);
      test_string = test_day.toString();
      if (jan_string[30] == test_string[30]) {           // If init day is in same state of DST as earlier year
        sunset_string += "17:50:00";                     // Later part of November
        sunrise_string += "05:30:00";                
      }
      else {      
        sunset_string += "19:00:00";
        sunrise_string += "06:20:00";
      }
      break;
    }
    case "Dec": {
      sunset_string += "18:00:00";
      sunrise_string += "05:50:00";
      break;
    }
    default: {
      sunset_string += "19:00:00";
      sunrise_string += "06:00:00";
      break;
    }
  }

  var sunset = new Date(sunset_string);
  var sunrise = new Date(sunset_string);
  sunrise.setDate(sunset.getDate() + 1);               // Sunrise will be the day after, so add one day.
  var sunrise_time = sunrise.toString();               // Then get string so you can edit it with the actual sunrise time. 
  sunrise_time = sunrise_time.substr(4, 12);           // Slice time off
  sunrise_string = sunrise_time + sunrise_string;
  sunrise = new Date(sunrise_string);

  // This all seems Hugely inefficient, but I don't know another way to do it lol
  // I hate daylight savings time soooo much.

  calendar.createEvent("Observing", sunset, sunrise);

  return;
}


// -------------------------------------
// Future Work

// we might could incorporate weather forecasts as well to display that or email some kinda summary. something 2 think abt

// if we wanted things to be more professional, we could change the hardcoded indeces to variables at the top of the page
// this would make them more readable and the code easier to understand, and we can change them if the sheets themselves change
// That being said, I'm lazy.

// Add "Shifts" functionality for first night shift n second night shift ?
// -------------------------------------



// Author: Pae Swanson


// Snippets used/referenced:
// https://stackoverflow.com/questions/42912227/how-to-add-data-to-a-specific-row-in-google-sheets-using-google-script
// https://stackoverflow.com/questions/12462318/find-a-value-in-an-array-of-objects-in-javascript (Listen . I'm a Python and C++ programmer.)
// https://www.geeksforgeeks.org/how-to-add-days-to-date-in-javascript/