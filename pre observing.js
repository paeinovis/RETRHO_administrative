var sheet = SpreadsheetApp.getActiveSpreadsheet();
var sheet_signup = sheet.getSheetByName("Signup");        // Forms data sheet - raw responses
var sheet_schedule = sheet.getSheetByName("Schedule");    // Parsed data sheet

var days_num = sheet_schedule.getLastRow() - 1;           // I realize Java style for vars is probably camelcase . but I like Python

var days_list = [];

// IMPORTANT: If any question locations change in the form, the numbers for the columns must be updated here.
// Note that google sheet indeces start at 1 rather than 0; the first column in a sheet is at index 1.

const MAX_OBS = 5;

// Column numbers for response sheet
const NAME_COL_NUM = 2;
const DAY_COL_NUM = 3;
const EMAIL_COL_NUM = 4;
const EXP_COL_NUM = 5;
const OPT_COL_NUM = 7;

// Column numbers for parsed sheet
const PARSED_DAY_COL_NUM = 1;
const NUM_OBS_COL = 2;
const SENIOR_COL_NUM = 3;
const JUNIOR_COL_NUM = 4;

var calendar = CalendarApp.getCalendarById("c180b8fc16923af0732b2d4a46a878a9066c78bcf6b302066acd636def2de972@group.calendar.google.com");

// Class for days
class ScheduledDay {
  constructor(day, num_obs, obs_list) {
    this.day = day;
    this.num_obs = num_obs;
    this.obs_list = obs_list;
  }
};

// Gathers data from Schedule sheet and creates day objects with it, then puts them in a list
// This function works as main(); if debugging, start from initDays
function initDays() {
  var days = sheet_schedule.getSheetValues(2, PARSED_DAY_COL_NUM, days_num, 1);
  var num_obs = sheet_schedule.getSheetValues(2, NUM_OBS_COL, days_num, 1);

  for (let i = 0; i < days_num; i++) {
    var curr_day = days[i][0];
    var curr_num_obs = num_obs[i][0];
    if (curr_num_obs == 0) {
      var curr_obs_list = [];
    }
    else {
      var curr_obs_list = sheet_schedule.getSheetValues(i + 2, JUNIOR_COL_NUM, 1, curr_num_obs);    // Get list of all signed up observers
    }
    var day = new ScheduledDay(curr_day, curr_num_obs, curr_obs_list);
    days_list.push(day);
  }
  parseSignup(days);
};


function parseSignup(days) {
  sortBySubmission();

  // Grab latest submission values
  var latest_entry_name = sheet_signup.getSheetValues(2, NAME_COL_NUM, 1, 1)[0][0];
  var latest_night_obs = sheet_signup.getSheetValues(2, DAY_COL_NUM, 1, 1)[0][0];
  var latest_entry_email = sheet_signup.getSheetValues(2, EMAIL_COL_NUM, 1, 1)[0][0];
  var latest_entry_exp = sheet_signup.getSheetValues(2, EXP_COL_NUM, 1, 1)[0][0];
  
  // Converts day intended to observe to a pretty string for email purposes
  let email_date = latest_night_obs.toString().substring(0, 15);

  if (!dateCheck(latest_night_obs)) {      // If date is in the past, do not add.
      sendFollowupEmail(latest_entry_name, email_date, latest_entry_email, false, "The date you input is in the past. Please ensure that the date you are signing up to observe is the current or future date.");
      return;
  }

  var color = 'orange';

  if (latest_entry_exp === "Senior") { 
    addSenior(latest_entry_name, latest_night_obs, latest_entry_email, days);
    return;
  }

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
    let index2 = JUNIOR_COL_NUM + curr_day.num_obs;                             // Column to list new observer
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
    sheet_schedule.getRange(index, NUM_OBS_COL, 1, 1).setValue(curr_num_obs);   // Add updated obs num to sheet
  }
  else {                                                                        // If first observer for a new date
    var index = days_num + 2;
    sheet_schedule.getRange(index, PARSED_DAY_COL_NUM, 1, 1).setValue(latest_night_obs);              // Set date to entry date
    sheet_schedule.getRange(index, NUM_OBS_COL, 1, 1).setValue(1);                                    // Set number of observers to 1
    sheet_schedule.getRange(index, JUNIOR_COL_NUM, 1, 1).setValue(latest_entry_name).setFontColor(color);          
    // Set first observer to entry name

    let cal_add = latest_night_obs.toString();
    timeParse(cal_add);       // New date for observing, add to calendar.
  }
  sortBySoonest();    // Re-sort after adding
  sendFollowupEmail(latest_entry_name, email_date, latest_entry_email, true);
};

// This sorts the dates forms submitted in the Signup sheet, with the most recent submission on top
function sortBySubmission() {
  sheet_signup.sort(1, false);
};

// This sorts the dates in the Schedule sheet, with the most recent date on top
function sortBySoonest() {
  sheet_schedule.sort(1, false);
};

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
};

function checkDuplicateName(listComp, indivComp) {
  if (listComp.length === 0) {
      var arr = [false, -1];
      return arr;
  }
  for (let i = 0; i < listComp[0].length; i++) {
    var curr = listComp[0][i].toString();
    if (curr.localeCompare(indivComp) === 0) {
      var arr = [true, i];
      return arr;
    }
  }
  var arr = [false, -1];
  return arr;
};

function addSenior(latest_entry_name, latest_night_obs, latest_entry_email, days) {
  let email_date = latest_night_obs.toString().substring(0, 15);
  var arr = checkDuplicateDays(days, latest_night_obs);
  if (arr[0]) {                                                                 // If day is already on schedule, don't re-add. Only add name
    let curr_day = days_list[arr[1]];
    let index = days_list.indexOf(curr_day) + 2;                                // Row to list new observer

    if (!sheet_schedule.getRange(index, SENIOR_COL_NUM, 1, 1).isBlank()) {      // If a senior observer has already signed up, do not add.
      sendFollowupEmail(latest_entry_name, email_date, latest_entry_email, false);
      return;
    }
                                          
  sheet_schedule.getRange(index, SENIOR_COL_NUM, 1, 1).setValue(latest_entry_name).setFontColor('blue');  
  sendFollowupEmail(latest_entry_name, email_date, latest_entry_email, true); 
  // Else add name to end of list
  }
  else {                                                                             // If first observer for a new date
    var index = days_num + 2;
    sheet_schedule.getRange(index, PARSED_DAY_COL_NUM, 1, 1).setValue(latest_night_obs);              // Set date to entry date
    sheet_schedule.getRange(index, NUM_OBS_COL, 1, 1).setValue(0);                                    // Set number of junior observers to 0
    sheet_schedule.getRange(index, SENIOR_COL_NUM, 1, 1).setValue(latest_entry_name).setFontColor('blue');   
    // Set senior observer

    let cal_add = latest_night_obs.toString();
    timeParse(cal_add);       // New date for observing, add to calendar.
  }
  sortBySoonest();    // Re-sort after adding
  sendFollowupEmail(latest_entry_name, email_date, latest_entry_email, true);
};

function sendFollowupEmail(name, date, email, success, extra_msg = "") {
  let text = "here";
  let followup_form_link = text.link("https://forms.gle/uho4GmKyziWcE3r86");
  let signup_form_link = text.link("https://forms.gle/Tf1zrxuVezn6nU5c8");
  let signup_sheet_link = text.link("https://docs.google.com/spreadsheets/d/1r_Dt8ZNdDHkeHi25e36xfJpojqJLoxDwxNC4BB9Y4Sw/edit?usp=sharing");
  let calendar_link = text.link("https://calendar.google.com/calendar/embed?src=c180b8fc16923af0732b2d4a46a878a9066c78bcf6b302066acd636def2de972%40group.calendar.google.com&ctz=America%2FNew_York");
  let sunset_time = timeParse(date, true); 

  var subj;
  var message;

  if (success) {
    subj = "[SUCCESS] - RETRHO Observing Schedule Updated";
    message = "Dear " + name + ",<br/><br/>" + 
    "Your request to be added to the observing schedule for the date <b>" + date + "</b> has successfully been processed." +
    "<br/><br/>Please check the observing signup Google sheet <b>" + signup_sheet_link + "</b> to ensure the information you entered was correct. If there was an error in your submission, you can reply to this email to update it." + 
    "<br/><br/><b>Please arrive at the observing room about an hour before sunset, approximated as " + sunset_time + "</b>, for observation planning. This estimated time can also be found on the calendar " + calendar_link + ". Observing takes place in the Bryant Space Science Center building near the Hub, in room 221b (221 is the undergrad lounge on the second floor)." +
    "<br/><br/>Please remember to complete the followup Google form to keep track of your observing history.<br/><b> The followup form can be found " + followup_form_link + "</b>." +
    "<br/><br/>Thank you for using the RETRHO interface.";
  }
  else {
    subj = "[ERROR] - RETRHO Observing Schedule Not Updated";
    message = "Dear " + name + ",<br/><br/>" + 
    "Your request to be added to the observing schedule for the date <b>" + date + "</b> has <b>NOT</b> been successfully processed. " + extra_msg + " Please retry submission through the signup Google form." +
    "<br/><br/> <b>The signup form can be found " + signup_form_link + "</b>." + 
    "<br/><br/> Note that only 5 observers can observe a night, so if there are 5 people already signed up, you will not be able to observe on that night. Alternatively, you may already be signed up. Please check the signup sheet " + signup_sheet_link + " before trying again. Note that if you are a senior observer, there may be one senior observer signed up already." +
    "<br/><br/>Thank you for using the RETRHO interface.";    
  }
  MailApp.sendEmail({
    to: email, 
    subject: subj, 
    htmlBody: message});
};

// This ensures people aren't signing up for the year 0025.
function dateCheck(date_to_obs) {
  var date = new Date(date_to_obs); 
  const today = new Date();
  today.setHours(0, 0, 0, 0);     // Set time to Zero because that is the time generated for signup; that way, it won't get hissy if the timeframe is for the same night (if the person is signing up for that night)
      // If window close happens before window opens, or if target has already expired
  if (date < today) {
    return false;
  }
  return true;
};

// Take date and parse info to determine start and end dates
function timeParse(date_to_obs, only_get_sunset_time=false) {            
  var month = date_to_obs.substr(4,3);
  var num_day = date_to_obs.substr(8, 2);
  var year = date_to_obs.substr(11, 4);
  var sunset_string = month + " " + num_day + " " + year + " ";
  var sunset_string_add = "";
  var sunrise_string = "";

  switch(month) {
    case "Jan": {
      sunset_string_add += "16:50:00";
      sunrise_string += "07:30:00";
      break;
    }
    case "Feb": {
      sunset_string_add += "17:20:00";
      sunrise_string += "07:10:00";
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
        sunset_string_add += "17:30:00";    
        sunrise_string += "06:50:00";                                                                
      }
      else {      
        sunset_string_add += "18:40:00";
        sunrise_string += "07:30:00";
      }
      break;
    }
    case "Apr": {
      sunset_string_add += "19:00:00";
      sunrise_string += "07:00:00";
      break;
    }
    case "May": { 
      sunset_string_add += "19:20:00";
      sunrise_string += "06:40:00";     
      break;
    }
    case "Jun": {
      sunset_string_add += "19:30:00";
      sunrise_string += "06:30:00";
      break;
    }
    case "Jul": {
      sunset_string_add += "19:30:00";
      sunrise_string += "06:40:00";
      break;
    }
    case "Aug": {
      sunset_string_add += "19:10:00";
      sunrise_string += "07:00:00";
      break;
    }
    case "Sep": {
      sunset_string_add += "18:30:00";
      sunrise_string += "07:10:00";
      break;
    }
    case "Oct": {
      sunset_string_add += "18:00:00";
      sunrise_string += "07:30:00";
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
        sunset_string_add += "16:30:00";                 // Later part of November
        sunrise_string += "07:00:00";                
      }
      else {      
        sunset_string_add += "17:40:00";
        sunrise_string += "07:40:00";
      }
      break;
    }
    case "Dec": {
      sunset_string_add += "16:30:00";
      sunrise_string += "07:20:00";
      break;
    }
    default: {
      sunset_string_add += "19:00:00";
      sunrise_string += "06:00:00";
      break;
    }
  }

  // Return time of sunset if requested, or continue to get full date otherwise
  if (only_get_sunset_time) { return sunset_string_add; }
  else { sunset_string += sunset_string_add; }

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

  return sunset_string_add;
};


// This is the function that runs daily between 8 and 9 am and sends emails to any people signed up And opted in 
// to receive a reminder email the day of a given observing day
// This functions as main for the daily trigger; if debugging, start here
function checkDayOfEmail() {
  const today = new Date().toLocaleDateString();
  var rows_num = sheet_signup.getLastRow() - 1;
  var dates = sheet_signup.getSheetValues(2, DAY_COL_NUM, rows_num, 1);
  var emails = sheet_signup.getSheetValues(2, EMAIL_COL_NUM, rows_num, 1);
  var opts = sheet_signup.getSheetValues(2, OPT_COL_NUM, rows_num, 1);

  // Goes through every signed up observe
  for (let i = 0; i < rows_num; i++) {
    var date_to_obs = dates[i][0];
    date_to_obs = new Date(date_to_obs.toString());
    var opt_in = opts[i][0];

    // Checks if the person opted in
    if (opt_in == 'Yes') {
      var date_to_obs_string = date_to_obs.toLocaleString().split(",");
      var date_to_obs_string = date_to_obs_string[0];
      // Checks if the date today and the date signed up to observe is the same
      if (today === date_to_obs_string) {
        var email = emails[i][0];
        // Sends reminder email if so
        sendDayOfEmail(email, date_to_obs)
      }
    }
  }
};

// Function that sends reminder email following checkDayOfEmail
function sendDayOfEmail(email, date){
  let text = "here";
  let followup_form_link = text.link("https://forms.gle/uho4GmKyziWcE3r86");
  let calendar_link = text.link("https://calendar.google.com/calendar/embed?src=c180b8fc16923af0732b2d4a46a878a9066c78bcf6b302066acd636def2de972%40group.calendar.google.com&ctz=America%2FNew_York");
  let sunset_time = timeParse(date.toString(), true); 

  var subj;
  var message;

  subj = "RETRHO Observing Reminder";
  message = "This is a requested reminder of your observing session today. If you were removed from the spreadsheet previously, you may ignore this message." +
  "<br/><br/><b>Please arrive at the observing room about an hour before sunset, approximated as " + sunset_time + "</b>, for observation planning. This estimated time can also be found on the calendar " + calendar_link + "." +
  "<br/><br/>Observing takes place in the Bryant Space Science Center building near the Hub, in room 221b (221 is the undergrad lounge on the second floor)." +
  "<br/><br/>Please remember to complete the followup Google form to keep track of your observing history.<br/><b> The followup form can be found " + followup_form_link + "</b>." +
  "<br/><br/>Thank you for using the RETRHO interface.";

  MailApp.sendEmail({
    to: email, 
    subject: subj, 
    htmlBody: message});
};


// -------------------------------------
// Future Work

// we might could incorporate weather forecasts as well to display that or email some kinda summary. something 2 think abt

// Add "Shifts" functionality for first night shift n second night shift ?
// -------------------------------------



// Author: Pae Swanson


// Snippets used/referenced:
// https://stackoverflow.com/questions/42912227/how-to-add-data-to-a-specific-row-in-google-sheets-using-google-script
// https://stackoverflow.com/questions/12462318/find-a-value-in-an-array-of-objects-in-javascript (Listen . I'm a Python and C++ programmer.)
// https://www.geeksforgeeks.org/how-to-add-days-to-date-in-javascript/