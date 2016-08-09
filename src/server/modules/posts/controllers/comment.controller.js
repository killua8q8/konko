'use strict';

import _ from 'lodash';
import mongoose from 'mongoose';
import utils from '../../../configs/utils';
const Comment = mongoose.model('Comment');
const Topic = mongoose.model('Topic');
const Panel = mongoose.model('Panel');
const Core = mongoose.model('Core');

/**
 * Controller that process comment request.
 *
 * @author C Killua
 * @module Konko/Posts/Controllers/Comment
 */
export default class CommentController {

  /**
   * @constructs
   */
  constructor() {}

  /**
   * Update Comment Schema so that it meets the limit config from Core settings.
   *
   * @param {Object} res - HTTP response.
   * @returns {Response} Response 500 if error exist.
   */
  static updateSchema(res) {
    return new Promise((resolve, reject) => {
      Core.find().then(cores => {
        let { post: { comment: { content } } } = cores[0];
        Comment.schema.path('content', {
          type: String,
          required: '{PATH} is required',
          minlength: content.min,
          maxlength: content.max,
        });
        resolve(cores[0]);
      }).catch(err => res.status(500).sjson({ message: err }));
    }).then(core => core);
  }

  /**
   * Get a comment then populates it, response as json.
   *
   * @param {Object} req - HTTP request.
   * @param {Object} res - HTTP response.
   * @static
   */
  static get({ comment }, res) {
    comment.populate('topic', '_id title panel').populate({
      path: 'author',
      select: '_id profile',
      populate: {
        path: 'profile',
        model: 'Profile',
        select: 'username avatar',
      },
    }, (err, comment) => {
      return err ? res.status(500).sjson({ message: err }) : res.status(200).sjson(comment);
    });
  }

  /**
   * Query all comments of a topic then populates them, response as json.
   *
   * @param {Object} req - HTTP request.
   * @param {Object} res - HTTP response.
   * @static
   */
  static list({ sanitizeQuery, query, topic, payload }, res) {
    sanitizeQuery('page').toInt();

    let page = {
      page: query.page || 1,
      pages: 0,
      size: payload.preference.commentListLimit,
      offset: ((query.page || 1) - 1) * payload.preference.commentListLimit,
      tid: topic._id,
      comments: [],
    };
    Comment.find({ topic: topic._id }, '-short', { skip: page.offset, limit: page.size })
      .lean().sort('-date')
      .populate('topic', '_id')
      .populate({
        path: 'author',
        model: 'User',
        select: '_id profile permission',
        populate: {
          path: 'profile',
          model: 'Profile',
          select: 'username avatar tagline',
        },
      }).exec()
      .then(comments => {
        Comment.count({ topic: topic._id }).then(count => {
          page.pages = Math.ceil(count / page.size);
          page.comments = comments;
          res.status(200).sjson(page);
        }).catch(err => res.status(500).sjson({ message: err }));
      }).catch(err => res.status(500).sjson({ message: err }));
  }

  /**
   * Create a comment with values from request body.
   *
   * @param {Object} req - HTTP request.
   * @param {Object} res - HTTP response.
   * @param {nextCallback} next - A callback to run.
   * @static
   */
  static create({ checkBody, validationErrors, body, topic, payload }, res, next) {
    CommentController.updateSchema(res).then(({ post: { comment: { short: { max } } } }) => {
      checkBody('content', 'Empty comment!').notEmpty();
      let errors = validationErrors();
      if (errors) {
        return res.status(400).sjson({ message: 'Cannot post a empty comment.' });
      }

      Comment.create(body).then(comment => {
        comment.short = comment.content.length <= max ? comment.content : new RegExp(`(^.{0,${max}}(?=[ ]))|(^.{0,${max}}(?=.))`, 'g').exec(comment.content)[0] + '...';
        comment.topic = topic;
        comment.author = payload;
        comment.save().then(comment => {
          topic.comments.push(comment);
          topic.lastReplyDate = comment.date;
            topic.save().then(topic => {
              Panel.findById(topic.panel).then(panel => {
                panel.addComment().then(panel => res.status(201).sjson(comment))
                  .catch(err => next(err));
              }).catch(err => next(err));
            }).catch(err => next(err));
        }).catch(err => next(err));
      }).catch(err => next(err));
    }).catch(err => next(err));
  }

  /**
   * Update a comment with values from request body, if has any.
   *
   * @param {Object} req - HTTP request.
   * @param {Object} res - HTTP response.
   * @static
   */
  static update({ checkBody, validationErrors, body, topic, comment, payload }, res) {
    CommentController.updateSchema(res).then(core => {
      checkBody('content', 'Cannot post a empty comment!').notEmpty();
      let errors = validationErrors();
      if (errors) {
        return res.status(400).sjson({ message: errors });
      }

      let page = { size: payload.preference.commentListLimit };
      Comment.find({ topic: topic._id }).lean().sort('-date').exec().then(comments => {
        page.page = Math.floor(_.findIndex(comments, c => c._id.equals(comment._id)) / page.size) + 1;
        utils.partialUpdate(body, comment, 'content');
        comment.updated.date = Date.now();
        comment.updated.by = payload.profile.username;
        comment.save().then(comment => {
          page.comment = comment;
          res.status(200).sjson(page);
        }).catch(err => res.status(500).sjson({ message: err }));
      }).catch(err => res.status(500).sjson({ message: err }));
    }).catch(err => res.status(500).sjson({ message: err }));
  }

  /**
   * Delete a comment then response back HTTP 200.
   *
   * @param {Object} req - HTTP request.
   * @param {Object} res - HTTP response.
   * @static
   */
  static delete({ topic, comment }, res) {
    topic.comments.remove(comment);
    topic.save().then(topic => {
      comment.remove()
        .then(() => res.status(200).sjson({ message: 'ok' }))
        .catch(err => res.status(500).sjson({ message: err }));
    }).catch(err => res.status(500).sjson({ message: err }));
  }

  /**
   * Calls model Comment method that doing like
   *
   * @param {Object} req - HTTP request.
   * @param {Object} res - HTTP response.
   * @param {nextCallback} next - A callback to run.
   */
  static like({ comment, payload }, res, next) {
    if (comment.likes.indexOf(payload._id) >= 0) {
      return res.status(403).sjson({ message: 'Forbidden' });
    } else {
      comment.like(payload._id)
        .then(comment => res.status(200).sjson({ likes: comment.likes }))
        .catch(err => next(err));
    }
  }

  /**
   * Calls model Comment method that doing unlike
   *
   * @param {Object} req - HTTP request.
   * @param {Object} res - HTTP response.
   * @param {nextCallback} next - A callback to run.
   */
  static dislike({ comment, payload }, res, next) {
    if (comment.likes.indexOf(payload._id) < 0) {
      return res.status(200).sjson({ likes: comment.likes });
    } else {
      comment.unlike(payload._id)
        .then(comment => res.status(200).sjson({ likes: comment.likes }))
        .catch(err => next(err));
    }
  }

  /**
   * Middleware, find a comment with an ID, then embed into req.
   *
   * @param {Object} req - HTTP request.
   * @param {Object} res - HTTP response.
   * @param {nextCallback} next - A callback to run.
   * @param {String} id - Mongo object id.
   * @static
   */
  static findCommentById(req, res, next, id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).sjson({
        message: 'Comment ID is invalid',
      });
    }

    Comment.findById(id)
      .select(req._fields).sort(req._sort).exec()
      .then(comment => (req.comment = comment) ? next() : res.status(404).sjson({ message: 'Comment is not found' }))
      .catch(err => next(err));
  }
}

/**
 * Callback that calls next middleware.
 *
 * @callback nextCallback
 * @param {Object} error - Error, if has any.
 */
