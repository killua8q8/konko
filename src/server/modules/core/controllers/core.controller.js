'use strict';

import mongoose from 'mongoose';
import utils from '../../../configs/utils';
const Core = mongoose.model('Core');

/**
 * Controller that process core request.
 *
 * @author C Killua
 * @module Konko/Core/Controllers/Core
 */
export default class CoreController {

  /**
   * @constructs
   */
  constructor() {}

  /**
   * Response a Core info as JSON
   *
   * @param {Object} req - HTTP request.
   * @param {Object} res - HTTP response.
   * @static
   */
  static get({ core }, res) {
    res.status(200).sjson(core);
  }

  /**
   * Response a basic Core setting as JSON
   *
   * @param {Object} req - HTTP request.
   * @param {Object} res - HTTP response.
   * @param {nextCallback} next - A callback to run.
   * @static
   */
  static getFields(req, res, next) {
    Core.findOne()
      .select(req._fields ? req._fields : 'basic')
      .exec()
      .then(core => {
        let _core = core.toObject();
        delete _core.admin;
        delete _core.mailer;
        res.status(200).sjson(_core);
      }).catch(err => next(err));
  }

  /**
   * Create a Core setting if does not exist one
   *
   * @param {Object} req - HTTP request.
   * @param {Object} res - HTTP response.
   * @param {nextCallback} next - A callback to run.
   * @static
   */
  static create(req, res, next) {
    req.checkBody('admin.email', 'Invalid admin email.').isEmail();
    req.getValidationResult().then(errors => {
      if (!errors.isEmpty()) {
        return res.status(400).sjson({ message: utils.validationErrorMessage(errors.array()) });
      }
      Core.find().then(([core, ...rest]) => {
        if (core && core.global.installed) {
          res.status(403).sjson({ message: 'Forbidden!' });
        } else {
          req.checkBody('basic.title', 'Title cannot be empty!').notEmpty();
          req.getValidationResult().then(errors => {
            if (!errors.isEmpty()) {
              return res.status(400).sjson({ message: utils.validationErrorMessage(errors.array()) });
            }
            Core.create(req.body).then(core => {
              core.global.styles.push({ name: 'Konko', root: 'styles/core' });
              core.save().then(core => res.status(201).sjson(core)).catch(err => next(err));
            }).catch(err => next(err));
          });
        }
      }).catch(err => next(err));
    });
  }

  /**
   * Update a Core setting with selected fields
   *
   * @param {Object} req - HTTP request.
   * @param {Object} res - HTTP response.
   * @static
   */
  static update({ body, core, _fields }, res) {
    if (!_fields) {
      return res.status(400).sjson({ message: 'No field was specified to update.' });
    }
    utils.partialUpdate(body, core, ..._fields.split(' '));
    core.save()
      .then(core => res.status(200).sjson(core))
      .catch(err => res.status(500).sjson({ message: err }));
  }

  /**
   * Middleware that finds core with given id.
   *
   * @param {Object} req - HTTP request.
   * @param {Object} res - HTTP response.
   * @param {nextCallback} next - A callback to run.
   * @param {String} id - Mongo object id.
   * @static
   */
  static findCoreById(req, res, next, id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).sjson({ message: 'Core ID is invalid' });
    }

    Core.findById(id).exec()
      .then(core => (req.core = core) ? next() : res.status(404).sjson({ message: 'Core is not found.' }))
      .catch(err => next(err));
  }

}

/**
 * Callback that calls next middleware.
 *
 * @callback nextCallback
 * @param {Object} error - Error, if has any.
 */
