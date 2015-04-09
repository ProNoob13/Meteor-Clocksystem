var Projects = new Mongo.Collection('projects');
var Hours = new Mongo.Collection('hours');

if (Meteor.isClient) {
  var app = {
    init: function() {
      Session.setDefault('creating', false);
      Session.setDefault('editing', false);
      Session.setDefault('active', false);
      Session.setDefault('id', false);

      Tracker.autorun(this.onSessionChange);

      Template.registerHelper('active', this.getActive);
      Template.registerHelper('editing', this.getEditMode);
      Template.registerHelper('creating', this.getCreateMode);

      Template.registerHelper('readonly', this.HTML.getReadonly);
      Template.registerHelper('disabled', this.HTML.getDisabled);

      Template.body.helpers({
        projects: this.getProjects,
        project: this.getProject,
        hours: this.getHours
      });

      Template.body.events({
        'click #punchcard': this.onClockButtonClick,
        'click .project.create': this.onCreateButtonClick,
        'click .project': this.onProjectSelect,
        'click #overview input': this.onProjectEdit,
        'click #overview textarea': this.onProjectEdit,
        'click #overview button.cancel': this.onEditFormReset,
        'click #overview button.delete': this.onEditFormDelete,
        'submit #edit': this.onEditFormSubmit,
      });

      return this;
    },

    //used in the template to check if we can clock in or out
    getActive: function() {
      //double negative used because the active state also stores the clock-id
      return !Session.equals('active', false);
    },
    
    //return whether or not we're currently creating/editing
    getEditMode: function(state) {
      if(typeof state == 'undefined')
        var state = true;

      return Session.equals('editing', state);
    },

    //return whether or not we're creating a project
    getCreateMode: function(state) {
      if(typeof state == 'undefined')
        var state = true;

      return Session.equals('creating', state);
    },

    //list all projects
    getProjects: function() {
      //placed here because we can't query yet during the init state
      var active = Hours.findOne({end: {$type: 10}});
      if(active) {
        Session.set('id', active.project);
        Session.set('active', active._id);
      }

      return Projects.find({});
    },

    getProject: function() {
      var project = Projects.findOne(Session.get('id'));
      
      if(project) {
        //if we're not editing, return the timetable as well
        if(Session.equals('editing', false)) {
          var worktimes = Hours.find({
            project: Session.get('id')
          });

          if(worktimes.count() > 0) {
            project.workdays = [];

            var last = '', hours = 0.0, time = 0.0, open = false;
            worktimes.forEach(function (worktime) {
              var starttime = '', endtime = '', date = '';

              //split the string to get the date and make it more readable
              if(worktime.start) {
                open = worktime._id;
                var start = worktime.start.toString().replace(/GMT.+$/, '');
                var starttime = start.slice(-8, -4);
                date = start.slice(0, -14);
              }
              if(worktime.end) {
                open = false;
                var end = worktime.end.toString().replace(/GMT.+$/, '');
                var endtime = end.slice(-8, -4);
              }

              //add the hours and the minutes to our subtotal
              if(starttime && endtime) {
                var started = starttime.split(':');
                var ended = endtime.split(':');

                time += ended[0] - started[0];
                time += ((1/60)*ended[1]) - ((1/60)*started[1]);
              }

              //prettyfying it to 01:00 instead of 1:00
              if(starttime) {
                starttime = '0' + starttime;
                starttime.slice(-5);
              }

              if(endtime) {
                endtime = '0' + endtime;
                endtime.slice(-5);
              }

              var timestring = time.toString().slice(0, 4);
              if(date == last && project.workdays.length > 0) {
                //if we're still on the same day, just append the new hours
                project.workdays[project.workdays.length - 1].hours = timestring;
                project.workdays[project.workdays.length - 1].times.push({
                  start: starttime,
                  end: endtime,
                });
              } else {
                //if we changed to a new date, start a new array for it
                project.workdays.push({
                  date: date,
                  hours: timestring,
                  times: [{
                    start: starttime,
                    end: endtime,
                  }]
                });

                //also add the subtotal to the total and reset it
                last = date;
                hours += time;
                time = 0;
              }
            });

            //if the last work-period wasn't closed yet, mark it as active
            if(open) {
              Session.set('active', open);
            }

            hours += time;
            project.hours = hours.toString().slice(0, 4); //2 decimal precision
          }
        }
      } else {
        project = {title: '', description: ''};
      }

      return project;
    },

    //invoked by the tracker, allowing for "editing" to change with "creating"
    onSessionChange: function() {
      Session.set('editing', Session.get('creating'));

      return false;
    },

    onEditFormSubmit: function() {
      if(Session.equals('creating', true)) {
        var project = Projects.insert({
          title: event.target.title.value,
          description: event.target.description.value,
          created: new Date(),
          updated: new Date()
        });

        if(project)
          Session.set('id', project);

        Session.set('creating', false);
      } else if(Session.equals('editing', true)) {
        Projects.update(Session.get('id'), {$set: {
          title: event.target.title.value,
          description: event.target.description.value,
          updated: new Date()
        }});

        Session.set('editing', false);
      }

      return false;
    },

    onEditFormReset: function() {
      if(Session.equals('creating', true))
        Session.set('creating', false);
      else
        Session.set('editing', false);

      return false;
    },

    onEditFormDelete: function() {
      Projects.remove(Session.get('id'), function(error, rows) {
        if(!isNaN(rows) && rows > 0) {
          Session.set('id', false);
          Session.set('editing', false);
        }
      });

      return false;
    },

    onCreateButtonClick: function() {
      //reset the current project to none and enter creation mode
      if(Session.equals('active', false) && Session.equals('editing', false)) {
        Session.set('creating', true);
        Session.set('id', false);
      }

      return false;
    },

    onClockButtonClick: function() {
      if(Session.equals('active', false)) {
        var worktime = Hours.insert({
          project: Session.get('id'),
          start: new Date(),
          end: null
        });

        if(worktime) {
          Session.set('active', worktime);
          
          return true;
        }
      } else {
        var worktime = Session.get('active');

        Hours.update(worktime, {$set: {end: new Date()}}, function() {
          Session.set('active', false);
        });

        return true;
      }

      return false;
    },

    onProjectSelect: function(event) {
      //can't switch projects while clocked in or without saving
      if(Session.equals('active', false) && Session.equals('editing', false))
        Session.set('id', event.currentTarget.id);

      return false;
    },

    onProjectEdit: function(event) {
      if(Session.equals('active', false)) {
        if(Session.equals('id', false)) {
          Session.set('creating', true);
        } else {
          Session.set('editing', true);
        }
      }

      return false;
    },

    //used for input states
    HTML: {
      getReadonly: function(variable, state) {
        if(typeof variable != 'string')
          return '';

        if(typeof state != 'boolean')
          var state = false;

        if(Session.equals(variable, state))
          return 'readonly';

        return '';
      },

      getDisabled: function(variable, state) {
        if(typeof variable != 'string')
          return '';

        if(typeof state != 'boolean')
          var state = false;

        if(Session.equals(variable, state))
          return 'disabled';

        return '';
      },
    }
  };

  app.init();
}