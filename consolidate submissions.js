const COLUMN_COUNT = 24;          // Number of columns in the template sheet
const ADD_COLS = 7;               // Number of columns preceding the template columns in Master sheet (template starts @ "Property")
const CODE_INDEX = 3;             // Index of reference code, for parsed sheet. Only change if column moves from C
const UNUSED_ROWS_TEMP = 3;              
// ^ Number of not-data rows in template sheet (column name row = 1, format row = 2, example row = 3)
const UNUSED_ROWS_MAST = 2;
// ^ Number of not-data rows in master sheet (column name row = 1, format row = 2)              

// Columns for form response sheet
const DATE_COL_NUM = 1;
const NAME_COL_NUM = 2;
const EMAIL_COL_NUM = 3;
const SHEET_LINK_COL_NUM = 4;
const NUM_TARG_COL_NUM = 5;
const ACCESS_COL_NUM = 6;

// Columns for submitted sheet
const TARGET_NAME_COL_NUM = 2;
const OBS_DATE_OPEN_COL_NUM = 8;
const OBS_DATE_CLOSE_COL_NUM = 9;    // Column index of observing window close date

var response_sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Form Responses 1");    // Response sheet for the current semester
var master_sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("TargetMasterSheet");     // Parsed sheet
// The name of "TargetMasterSheet" is one word to avoid Linux shenanigans ^
var master_response_sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("All Responses");    
// ^ Sheet of responses for all semesters excl. current
var expired_sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Expired Targets");      
// ^ Targets whose obs windows have passed, or observations have been completed
var target_submit_sheet;
// ^ To-be sheet that was submitted by user

function consolidate() {
  sortBySubmission();

  // Grab latest submission values and submitted sheet
  var latest_entry_date = response_sheet.getSheetValues(2, DATE_COL_NUM, 1, 1)[0][0];
  var latest_entry_name = response_sheet.getSheetValues(2, NAME_COL_NUM, 1, 1)[0][0];
  var latest_entry_email = response_sheet.getSheetValues(2, EMAIL_COL_NUM, 1, 1)[0][0];
  var latest_entry_sheet_link = response_sheet.getSheetValues(2, SHEET_LINK_COL_NUM, 1, 1)[0][0];
  var latest_entry_num_targets = response_sheet.getSheetValues(2, NUM_TARG_COL_NUM, 1, 1)[0][0];
  var latest_entry_access = response_sheet.getSheetValues(2, ACCESS_COL_NUM, 1, 1)[0][0];

  // Get sheet id from link
  let len = latest_entry_sheet_link.length;
  var id = latest_entry_sheet_link.substring(33, len);   
  replaceSheet(id);
  
  // Compare template sheet and submitted sheet to ensure same # and content of columns
  var col_headers_submit = target_submit_sheet.getSheetValues(1, 1, 1, COLUMN_COUNT);   
  var col_headers_template = master_sheet.getSheetValues(1, ADD_COLS + 1, 1, COLUMN_COUNT);

  var arr_submit = JSON.stringify(col_headers_submit);
  arr_submit = arr_submit.replace(/[\r\n\s]+/gm, "");               // Removes whitespace to allow for comparison
  var arr_template = JSON.stringify(col_headers_template);
  arr_template = arr_template.replace(/[\r\n\s]+/gm, "");

  var windows = dateCheck(latest_entry_num_targets);

  // If columns match and obs windows are valid, attempt to store targets in master sheet
  if ((arr_submit === arr_template) && windows[0]) {                                
    storeTargets(latest_entry_date, latest_entry_name, latest_entry_email, latest_entry_num_targets, latest_entry_access);
  }
  else if (!windows[0]) {
    var list_msg = windows[1];
    var string_msg = "";
    for (let i = 0; i < list_msg.length; i++) {
      string_msg += list_msg[i];
      string_msg += ", ";
      if (i == list_msg.length - 2) {
        string_msg += "and ";
      }
    }
    sendEmail(latest_entry_name, latest_entry_email, false, "Window Mismatch", string_msg);
  }
  else {                                                            // Otherwise, the user or program might've messed something up w/ columns
    var list_msg = findDiff(col_headers_template[0], col_headers_submit[0]);
    var string_msg = "";
    for (let i = 0; i < list_msg.length; i++) {
      string_msg += list_msg[i];
      string_msg += ", ";
      if (i == list_msg.length - 2) {
        string_msg += "and ";
      }
    }
    sendEmail(latest_entry_name, latest_entry_email, false, "Column Mismatch", string_msg);
  }
}


// Put targets from submitted sheet into master sheet (assumes correct user input after the column check)
function storeTargets(date, name, email, num_targets, access) {
  var targets_names = [];
  var ref_code = determineSwitch(date);
  try {
    var last_row = master_sheet.getLastRow();           // Gets index of row where data ends - new data will be added After this row.
    for (let i = 1; i <= num_targets; i++) {
      var index = last_row + i;
      master_sheet.getRange(index, ADD_COLS - 2, 1, 3).setValues([[name, email, access]]);        // Set three user-related columns to submitted conditions
      master_sheet.getRange(index, DATE_COL_NUM, 1, 1).setValue(date);                            // Set date that target was submitted
      master_sheet.getRange(index, CODE_INDEX, 1, 1).setValue(ref_code);                          // Set the previously-generated reference code
      let to_set_vals = target_submit_sheet.getSheetValues(i + UNUSED_ROWS_TEMP, 1, 1, COLUMN_COUNT);            // Grab target info (while ignoring first 3 rows, which are Column Titles, Format, and Example)
      master_sheet.getRange(index, ADD_COLS + 1, 1, COLUMN_COUNT).setValues(to_set_vals);         // Set info in master sheet As submitted target info
      targets_names.push(to_set_vals[0][1]);                                                      // Grab names of targets
    }
    var string_target_names = "";
    for (let i = 0; i < targets_names.length; i++) {
      string_target_names += targets_names[i];                 // Stringifies target names and adds to list
      if (i != targets_names.length - 1) {
        string_target_names += "<br/>";                        // Add breaks after names except last item
      }
    }
    sendEmail(name, email, true, string_target_names, ref_code);  
    // Purpose of msg is to catch an error if not success or related to template issue (which falls under "Column Mismatch")
    // But also useful to send list of target names back
  }
  catch(err) {
    // If they messed something up with data validation Somehow, this will Probably catch the failure. 
    // I'm sure other things will make it fail as well, but we'll figure those out as we go
    sendEmail(name, email, false, err, ref_code);      
  }
};


// This ensures obs windows are valid
function dateCheck(num_targets) {
  var valid = true;
  problems = [];
  var win_open = target_submit_sheet.getSheetValues(1 + UNUSED_ROWS_TEMP, OBS_DATE_OPEN_COL_NUM, num_targets, 1);
  var win_close = target_submit_sheet.getSheetValues(1 + UNUSED_ROWS_TEMP, OBS_DATE_CLOSE_COL_NUM, num_targets, 1);
  var targets_names = target_submit_sheet.getSheetValues(1 + UNUSED_ROWS_TEMP, TARGET_NAME_COL_NUM, num_targets, 1);
  const today = new Date();

    for (let i = 0; i < num_targets; i++) {
      // If window close happens before window opens, or if target has already expired
      if ((win_close[i][0] < win_open[i][0]) || ((win_close[i][0] < today) && (win_open[i][0] < today))){
        problems.push(targets_names[i][0]);
        valid = false;
      }
    }

  return [valid, problems];
};

// This sorts the dates forms submitted in the Signup sheet, with the most recent submission on top.
function sortBySubmission() {
  response_sheet.sort(1, false);
};


// Convert not-Google-sheets files to Google sheets bc otherwise Google throws a fit. Source: user Tanaike on Stack Overflow
function replaceSheet(fileID) {                                   
  const convertedFileId = Drive.Files.copy({ title: "temp", mimeType: MimeType.GOOGLE_SHEETS }, fileID, { supportsAllDrives: true }).id;
  target_submit_sheet = SpreadsheetApp.openById(convertedFileId);
};


function getRefCode(date) {
  var date_obj = new Date(date); 
  var year = date_obj.getFullYear();
  year = year.toString();
  var semester = determineSemester(date_obj.getMonth());

  var last_row = response_sheet.getLastRow() - 1;           // Gets index of last row to determine how many submissions have been made in total.

  var num = last_row.toString();
  switch (num.length) {             // Adds zeroes before number in the event number is < 3 digits long
    case 1:
      num = "00" + num;
      break;
    case 2:
      num = "0" + num;
      break;
    default:
      break;
  }
  var str = year.substr(2, 2) + semester + num;
  return str;
};


function determineSwitch(date) {
  var last_row = response_sheet.getLastRow();
  if (last_row == 2) {
    return getRefCode(date);                  // If First submission somehow, don't compare to anything.
  } 
  var last_semester = getRefCode(response_sheet.getSheetValues(3, 1, 1, 1)[0][0]);      // Generate ref code of last submission date Before most recent submission date
  last_semester = last_semester[2];           // Get semester letter of the most recent submission
  var curr_ref_code = getRefCode(date);       // Generate ref code of most recent submission date
  var curr_semester = curr_ref_code[2];
  if (curr_semester === last_semester) {      // If same semester, don't clear
    return curr_ref_code;
  }
  else {                                      // If not same semester, reset count by clearing submissions and storing them in other sheet
    var last_col = response_sheet.getLastColumn();
    let to_set_vals_2 = response_sheet.getSheetValues(3, 1, last_row, last_col);
    var last_mast_row = master_response_sheet.getLastRow();
    master_response_sheet.getRange(last_mast_row, 1, last_row, last_col).setValues(to_set_vals_2);
    response_sheet.deleteRows(3, last_row);
    return getRefCode(date);                  // Return ref code with reset values 
  }
};


function determineSemester(month) {
  switch(month) {
    case 0:         // If first four months (Jan, Feb, Mar, Apr), Semester A
    case 1:
    case 2:
    case 3:
      return "A";
    case 4:         // If middle four months (May, June, July, Aug), Semester B
    case 5:
    case 6:
    case 7:
      return "B";
    case 8:         // If last four months (Sep, Oct, Nov, Dec), Semester C 
    case 9:
    case 10:
    case 11:
      return "C";
    default:
      return "ERROR";
  }
};


function sendEmail(name, email, success, msg, code) {     
  let text = "here";
  let template_link = text.link("https://docs.google.com/spreadsheets/d/1jmg1gVpVr_TolXQAsdeYCSqASI9KLJXgMmgJZJXXG8Y/edit?usp=drive_link");
  let submit_link = text.link("https://forms.gle/Tf1zrxuVezn6nU5c8");

  var subj;
  var message;

  if (success) {
    subj = "[SUCCESS] - RETRHO Target Submission";
    message = "Dear " + name + "," + 
    "<br/><br/>Your target submission has successfully been processed. Your reference code for this submission is <b>" + code + "</b>." +
    "<br/><br/>If there was an error in your submission, please reply to this email to update it (see the list of targets at the end of this email). " + "If you would like to submit another spreadsheet of targets, please submit another form <b>" + submit_link + "</b>." +
    "<br/><br/>Thank you for using the RETRHO interface." + 
    "<br/><br/><br/><b>List of targets:</b><br/>" + msg;
  }
  else {
    // If ERROR, delete latest (erroneous) submission info from response sheet as to not count it toward future project codes - but store it just in case
    var last_col = response_sheet.getLastColumn();
    let to_set_vals = response_sheet.getSheetValues(2, 1, 1, last_col);
    var last_mast_row = master_response_sheet.getLastRow();
    master_response_sheet.getRange(last_mast_row, 1, 1, last_col).setValues(to_set_vals);
    response_sheet.deleteRows(2, 1);

    subj = "[ERROR] - RETRHO Target Submission Failure";
    var err_msg = "";
    switch(msg) {
      case "Column Mismatch": {
        err_msg = "There was a discrepancy detected between the template sheet and the submitted sheet in the columns " + code + "which is preventing the program from parsing the targets. Please make sure to use the latest template sheet found <b>" + template_link + "</b> to ensure your submission can be processed correctly."
        break;
      }
      case "Window Mismatch" : {
        err_msg = "There was a discrepancy detected between the observing windows for the targets " + code + "which is preventing the program from parsing the targets. Please make sure that all observing windows have an opening date prior to their close date, these dates are at least one day apart, and both dates occur before the current date." +
        "</br><br/>If you would like to resubmit your targets, the latest template sheet can be found <b>" + template_link + "</b>."
        break;

      }
      default: {
        err_msg = "For troubleshooting purposes, the error thrown by our parsing code was " + msg + ".";
        break;
      }
    }
    message = "Dear " + name + "," + 
    "<br/><br/>Your target submission has <b>NOT</b> been successfully processed." +
    "<br/><br/>" + err_msg +
    "<br/><br/>If you believe this is an internal error or you cannot successfully submit your target list, please reply to this email so we may assist you and rectify the issue. Otherwise, you may retry submission through the Google form <b>" + submit_link + "</b>." +
    "<br/><br/>Thank you for using the RETRHO interface.";    
  }
  MailApp.sendEmail({
    to: email, 
    subject: subj, 
    htmlBody: message});
};


// If there is a column mismatch, figures out which columns are missing and returns array of strings of these columns
function findDiff(correct_str, user_str) {
  let diff = [];
  let j = 0;
  for (let i = 0; j < correct_str.length; i++) {
    var correct_col = correct_str[j].replace(/[\r\n\s]+/gm, "");
    var user_col = user_str[i].replace(/[\r\n\s]+/gm, "");
    if (correct_col !== user_col) {
      diff.push(correct_str[j]);
      i--;
    }
    j++;
  }
  return diff;
};


// This runs daily to clip out old targets
function moveExpired(){
  const today = new Date();
  var rows_num = master_sheet.getLastRow() - UNUSED_ROWS_MAST;
  var last_row = master_sheet.getLastRow();
  var dates_close = master_sheet.getSheetValues(UNUSED_ROWS_MAST + 1, OBS_DATE_CLOSE_COL_NUM, rows_num, 1);
  var last_col = master_sheet.getLastColumn();

  for (let i = last_row; i > UNUSED_ROWS_MAST; i--) {
    rows_num--;
    var date_close = dates_close[rows_num][0];
    // If target has expired (a.k.a. ability to observe it has passed), remove
    if(today > date_close) {
      let to_set_vals = master_sheet.getSheetValues(i, 1, 1, last_col);
      let last_row_exp = expired_sheet.getLastRow();
      expired_sheet.getRange(last_row_exp + 1, 1, 1, last_col).setValues(to_set_vals);
      master_sheet.deleteRows(i, 1);
    }
  }
};


// -------------------------------------
// Future Work

// -------------------------------------



// Author: Pae Swanson


// Snippets used/referenced:
// https://stackoverflow.com/questions/65437150/google-apps-script-convert-xlsx-to-sheet-overwriting-the-existing-one
// https://stackoverflow.com/questions/9849754/how-can-i-replace-newlines-line-breaks-with-spaces-in-javascript