import { Notification } from '../dao/entity/notification.entity';
import { ActivityDAO } from '../dao/activity.dao';
import { WatcherDAO } from '../dao/watcher.dao';
import { NotificationDAO } from '../dao/notification.dao';
import { PreferenceDAO } from '../dao/preference.dao';
import { Activity } from '../dao/entity/activity.entity';
import { validateActivity } from './validators/validateActivity';
import { ValidationError } from '../type/validation.error';
import { IOService } from './io.service';
import { getResource } from '../gateway/get.resource.gateway';
import { config } from '../config/activityConfig';
import { EmailService } from './email.service';
import { vars } from '../config/vars';
import { Utils } from '../utility/utils';
import { Watcher } from '../dao/entity/watchers.entity';
import { WatcherGroup } from '../enum/watcher.group';
import { Constants } from '../utility/constants';
import { AuthGateway } from '../gateway/auth.gateway';
import { Task } from '../type/task.type';
import { CreateNotificationPayload } from '../type/create.notification.payload.type';
import { MerchTeamPreference } from '../dao/entity/merchTeamPreference.entity';

const logger = require('../logger');
const className = '[ActivityService]';

export class ActivityService {
  static async createInstance() {
    return new ActivityService();
  }

  private activityDAO = ActivityDAO.createInstance();
  private watcherDAO = WatcherDAO.createInstance();
  private ioService = IOService.createInstance();
  private notificationDAO = NotificationDAO.createInstance();
  private emailService = EmailService.createInstance();
  private preferenceDAO = PreferenceDAO.createInstance();

  async saveActivity(activity: Activity) {
    const methodName = '[saveActivity]';
    logger.info(className + methodName + ' start: ' + activity.type);
    const result = validateActivity(activity);
    if (result.error) {
      const error: ValidationError = {
        error: result.error,
      };
      return error;
    }
    try {
      const createdActivity = await this.activityDAO.saveActivity(activity);
      logger.info(
        className +
          methodName +
          ' activity: ' +
          Utils.stringify(createdActivity)
      );
      const activityMeta = config[activity.type];
      if (!activityMeta.notify) {
        return createdActivity;
      }

      // tslint:disable-next-line: no-any
      let finalResource: any = {};
      // tslint:disable-next-line: no-any
      let resource: any = {};
      // tslint:disable-next-line: no-any
      let targetResource: any = {};

      if (activityMeta.resourceUrl && createdActivity.resourceId) {
        const url = activityMeta.resourceUrl.includes('product')
          ? activityMeta.resourceUrl
              .replace(':id', activity.resourceId.toString())
              .concat('', '?notification=true')
          : activityMeta.resourceUrl.replace(
              ':id',
              activity.resourceId.toString()
            );
        const resourceResponse = await getResource(url);
        logger.info(
          className + methodName + ' getResource url of resource is' + url
        );
        resource = resourceResponse.data.result || {};
      }

      if (activityMeta.targetResourceUrl && createdActivity.targetResourceId) {
        const url = activityMeta.targetResourceUrl.includes('product')
          ? activityMeta.targetResourceUrl
              .replace(':id', activity.targetResourceId.toString())
              .concat('', '?notification=true')
          : activityMeta.targetResourceUrl.replace(
              ':id',
              activity.targetResourceId.toString()
            );
        const targetResourceResponse = await getResource(url);
        logger.info(
          className + methodName + ' getResource url of targetResource is' + url
        );
        targetResource = targetResourceResponse.data.result || {};
      }

      // below condition is to avoid existing workflow to break
      if (
        [
          Constants.IMPORT_PRODUCT_DONE,
          Constants.IMPORT_PRODUCT_FAILED,
          Constants.IMPORT_PRODUCT_INCOMPLETE,
        ].includes(activity.type)
      ) {
        finalResource = { ...this._setCreatedAndFailedProductCount(resource) };
      } else if (createdActivity.resourceName === Constants.PRODUCT) {
        finalResource = { ...resource, ...finalResource };
        finalResource = { ...targetResource, ...finalResource };
      } else if (createdActivity.targetResourceName === Constants.PRODUCT) {
        finalResource[createdActivity.resourceName] = resource;
        finalResource = { ...targetResource, ...finalResource };
      } else {
        if (activity.productId) {
          const url = `${vars.baseUrl}${Constants.FETCH_PRODUCT_DETAILS_BY_ID_URL}`
            .replace(':id', activity.productId.toString())
            .concat('', '?notification=true');
          const productResp = await getResource(url);
          logger.info(
            className + methodName + ' fetchProductDeatailsByIdUrl:' + url
          );
          finalResource = productResp.data.result || {};
        }
        finalResource[createdActivity.resourceName] = resource;
        if (createdActivity.targetResourceName) {
          finalResource[createdActivity.targetResourceName] = targetResource;
        }
      }

      finalResource.activityByName = activity.activityByName;
      finalResource.avatar = activity.activityByName
        .split(' ')
        .map(i => i.charAt(0))
        .join('');

      logger.info('Finale Resource: ' + Utils.stringify(finalResource));

      if (activity.type === Constants.UPDATE_STATUS) {
        finalResource.previousSavedStatus = activity.message
          .split(' from')[1]
          .split(' to')[0]
          .trim();
      }

      if (
        (activity.type === Constants.INTERNAL_COMMENT_ON_PRODUCT ||
          activity.type === Constants.COMMENT_ON_PRODUCT ||
          activity.type === Constants.TAGGED_USER_ON_COMMENT ||
          activity.type === Constants.TAGGED_USER_ON_REPLY ||
          activity.type === Constants.REPLY_COMMENT_ON_PRODUCT ||
          activity.type === Constants.INTERNAL_REPLY_COMMENT_ON_PRODUCT) &&
        createdActivity.metadata
      ) {
        const metadata = JSON.parse(createdActivity.metadata);
        finalResource.comment_message = metadata.message;
      }

      // flag to check if user have the proper permission
      let isHavingPermission = true;

      // tslint:disable-next-line: no-any
      let isNotifiedUser: any = null;

      if (activity.commentActivityType) {
        finalResource.commentBoxType = activity.commentActivityType;
      }

      const userDetails = await this.getUserDetails();

      const userDetail = userDetails.find(
        // tslint:disable-next-line: no-any
        (user: any) => user.email === activity.notify
      );
      const product = finalResource.productDetails || finalResource;
      const userId: string = userDetail?.email ?? activity.notify;
      logger.info(className + methodName + ' userId: ' + userId);
      const merchId: string = product.merchandise?.teamId;
      logger.info(className + methodName + ' merchId: ' + merchId);
      if (
        userDetail &&
        userDetail.isBuyer &&
        Constants.BUYER_STATUSES.indexOf(product.status.status) === -1
      ) {
        isHavingPermission = false;
      }

      if (
        userDetail &&
        userDetail.isBuyer &&
        (activity.type === Constants.REMOVE_BUYER ||
          activity.type === Constants.INVITE_BUYER)
      ) {
        isHavingPermission = true;
      }

      logger.debug('activityMeta' + Utils.stringify(activityMeta));
      logger.info('activityMeta.type ' + activityMeta.type);
      if (activityMeta.type === 'INDIVIDUAL') {
        if (
          activityMeta.requiredPermissionCheck &&
          activity.commentActivityType
        ) {
          try {
            // tslint:disable-next-line: no-any
            const userDetail = userDetails.find(
              // tslint:disable-next-line: no-any
              (user: any) => user.email === activity.notify
            );
            isHavingPermission = this._checkCommentTypePermission(
              userDetail,
              activity
            );
          } catch (error) {
            return error;
          }
        }

        if (
          activity.type === Constants.REPLY_ON_COMMENT &&
          finalResource.comment &&
          finalResource.reply
        ) {
          if (activity.notify === finalResource.reply.createdBy) {
            isNotifiedUser = true;
          }
        }
        logger.info(
          className + methodName + ' isHavingPermission:' + isHavingPermission
        );

        if (userId && merchId) {
          const notificationsEnabled = await this.isNotificationEnabled(
            userId,
            merchId
          );
          logger.info(
            className +
              methodName +
              ' notificationEnabled: line-238 ' +
              notificationsEnabled
          );
          if (!notificationsEnabled) {
            return;
          }
        }

        logger.info(
          className + methodName + ' isNotifiedUser:' + isNotifiedUser
        );

        if (isHavingPermission && !isNotifiedUser) {
          const receiverName =
            userDetails.find(
              (user: { email: string }) => user.email === activity.notify
            )?.name || '';
          const savedNotification = [
            Constants.IMPORT_PRODUCT_DONE,
            Constants.IMPORT_PRODUCT_FAILED,
            Constants.IMPORT_PRODUCT_INCOMPLETE,
          ].includes(activity.type)
            ? await this.createNotificationForImportProducts({
                message: activity.message,
                sender: activity.activityBy,
                receiver: activity.notify,
                senderName: activity.activityByName,
                receiverName,
                activityType: activity.type,
                resourceId: finalResource.jobId,
                createdActivity,
              })
            : await this.createNotification({
                resource: finalResource,
                message: activity.message,
                sender: activity.activityBy,
                receiver: activity.notify,
                senderName: activity.activityByName,
                receiverName,
                activityType: activity.type,
                createdActivity,
              });
          finalResource.notificationId = savedNotification?.id;
          this.ioService.sendEvent(activity.notify, activity.type, {
            message: activity.message,
            activityBy: activity.activityBy,
            activityByName: activity.activityByName,
            ...finalResource,
          });
          this.sendMail(
            !activityMeta.email ? false : activityMeta.email,
            vars.isMailOn,
            activity.notify,
            finalResource,
            !activityMeta.emailtemplateUrl ? '' : activityMeta.emailtemplateUrl
          );

          if (activityMeta.notifyPageOnly) {
            this.sendNotificationToPage(activity, resource);
          }
        }
        return createdActivity;
      }

      const watchers = await this.watcherDAO.getWatchers(
        activity.resourceName,
        activity.resourceId,
        activity.targetResourceName,
        activity.targetResourceId
      );
      let watchersByGroup;
      // manage TX workflows exceptions
      const start = Date.now();
      if (activity.departments && activity.departments.length) {
        logger.info(
          className +
            methodName +
            'Manage product id: ' +
            activity.resourceId +
            ' watchers according to department: ' +
            activity.departments +
            ' start time :' +
            start
        );
        watchersByGroup = await this.manageWatchersByDepartment(
          finalResource,
          activity.departments,
          watchers
        );
      } else {
        watchersByGroup = this.filterWatchersByGroup(
          watchers,
          activityMeta.notifyGroup || []
        );
      }
      // tslint:disable-next-line: no-any
      let watcherUserDetails: any;
      logger.debug('activityMeta: ' + Utils.stringify(activityMeta));
      logger.debug('activity: ' + Utils.stringify(activity));

      if (
        (activityMeta.requiredPermissionCheck &&
          activity.commentActivityType) ||
        activity.type === Constants.INVITE_BUYER_BY_PRODUCT_BUYER ||
        activity.type === Constants.REMOVE_BUYER_BY_PRODUCT_BUYER ||
        activity.type === Constants.INVITE_BUYER_BY_PRODUCT_SUPPLIER ||
        activity.type === Constants.REMOVE_BUYER_BY_PRODUCT_SUPPLIER ||
        activity.type === Constants.EDIT_PRODUCT
      ) {
        try {
          watcherUserDetails = userDetails;
        } catch (error) {
          logger.error(className + methodName + 'error: ' + error);
          return error;
        }
      }
      let primaryBuyerEmail: string;
      if (activity.type === Constants.REMOVE_BUYER_BY_PRODUCT_SUPPLIER) {
        if (resource?.productIdentifier?.buyers?.length) {
          const primaryBuyer = resource.productIdentifier.buyers.find(
            // tslint:disable-next-line: no-any
            (buyer: any) => buyer.isPrimaryBuyer
          );
          if (primaryBuyer) {
            primaryBuyerEmail = primaryBuyer.emailId;
          }
        }
      }

      const responsTime = Date.now() - start;
      logger.info(
        className +
          methodName +
          'Overall time required for product id: ' +
          activity.resourceId +
          ' watchers according to department: ' +
          activity.departments +
          ' responsTime :' +
          responsTime
      );
      watchersByGroup.forEach(async (watcher: Watcher) => {
        // reassigning isHavingPermission to true
        isHavingPermission = true;
        const watcherBuyerDetail = userDetails.find(
          // tslint:disable-next-line: no-any
          (ud: any) => ud.email === watcher.notificationId
        );
        if (
          watcherBuyerDetail &&
          watcherBuyerDetail.isBuyer &&
          Constants.BUYER_STATUSES.indexOf(product.status.status) === -1
        ) {
          isHavingPermission = false;
        }
        if (watcherUserDetails) {
          const watcherDetail = watcherUserDetails.find(
            // tslint:disable-next-line: no-any
            (ud: any) => ud.email === watcher.notificationId
          );
          logger.debug('before isHavingPermission ' + isHavingPermission);
          if (activity.commentActivityType) {
            isHavingPermission = this._checkCommentTypePermission(
              watcherDetail,
              activity
            );
          }
          logger.debug('after isHavingPermission ' + isHavingPermission);

          const product = finalResource.productDetails || finalResource;

          if (
            activity.type === Constants.EDIT_PRODUCT &&
            watcherDetail &&
            watcherDetail.isBuyer &&
            product.status.status === Constants.CONFIRMED_STATUS &&
            product.type.type === Constants.TEXTILE
          ) {
            isHavingPermission = false;
          }

          if (
            activity.type === Constants.INVITE_BUYER_BY_PRODUCT_BUYER ||
            activity.type === Constants.REMOVE_BUYER_BY_PRODUCT_BUYER ||
            activity.type === Constants.INVITE_BUYER_BY_PRODUCT_SUPPLIER ||
            activity.type === Constants.REMOVE_BUYER_BY_PRODUCT_SUPPLIER
          ) {
            if (watcherDetail && watcherDetail.isBuyer) {
              isNotifiedUser = false;
              isHavingPermission = false;
            } else {
              isHavingPermission = true;
            }
          }
          if (
            activity.type === Constants.REMOVE_BUYER_BY_PRODUCT_SUPPLIER &&
            watcherDetail &&
            watcherDetail.isBuyer &&
            watcherDetail.email === primaryBuyerEmail
          ) {
            isHavingPermission = true;
          }
        }

        if (createdActivity.metadata) {
          const metadata = JSON.parse(createdActivity.metadata);
          const userTags = metadata.userTags || [];

          // tslint:disable-next-line: variable-name
          isNotifiedUser = userTags.find(
            (taggedUser: { emailId: string; name: string }) =>
              taggedUser.emailId === watcher.notificationId
          );

          logger.info(
            className +
              methodName +
              'activity type: ' +
              activity.type +
              ' isNotifiedUser: ' +
              isNotifiedUser +
              ' userTags: ' +
              Utils.stringify(userTags) +
              ' watcher.notificationId: ' +
              watcher.notificationId
          );

          // if user is tagged in comment then prevent content creator notification
          if (
            activity.type === Constants.TAGGED_USER_ON_PRODUCT &&
            isNotifiedUser &&
            userTags.length > 0 &&
            userTags.find(
              (taggedUser: { emailId: string; name: string }) =>
                taggedUser.emailId === watcher.notificationId
            )
          ) {
            isNotifiedUser = false;
            isHavingPermission = false;
          }
        }

        if (
          (activity.type === Constants.REPLY_COMMENT_ON_PRODUCT ||
            activity.type === Constants.INTERNAL_REPLY_COMMENT_ON_PRODUCT) &&
          finalResource.comment
        ) {
          if (
            watcher.notificationId === finalResource.comment.createdBy &&
            watcher.notificationId === finalResource.createdBy
          ) {
            isNotifiedUser = true;
          } else if (
            watcher.notificationId === finalResource.comment.createdBy
          ) {
            isNotifiedUser = true;
          }
        }

        if (userId && merchId) {
          const notificationsEnabled = await this.isNotificationEnabled(
            userId,
            merchId
          );
          logger.info(
            className +
              methodName +
              ' notificationEnabled: line-499 ' +
              notificationsEnabled
          );
          if (!notificationsEnabled) {
            return;
          }
        }

        logger.info('watcher.notificationId: ' + watcher.notificationId);
        logger.info('activity.activityBy: ' + activity.activityBy);
        logger.info('isNotifiedUser: ' + isNotifiedUser);
        logger.info('isHavingPermission: ' + isHavingPermission);

        if (
          watcher.notificationId !== activity.activityBy &&
          !isNotifiedUser &&
          isHavingPermission
        ) {
          const receiverName =
            userDetails.find(
              (user: { email: string }) => user.email === watcher.notificationId
            )?.name || '';
          const savedNotification = await this.createNotification({
            resource: finalResource,
            message: activity.message,
            sender: activity.activityBy,
            receiver: watcher.notificationId,
            senderName: activity.activityByName,
            receiverName,
            activityType: activity.type,
            createdActivity,
          });
          finalResource.notificationId = savedNotification?.id;
          this.ioService.sendEvent(watcher.notificationId, activity.type, {
            ...finalResource,
            message: activity.message,
            activityBy: activity.activityBy,
            activityByName: activity.activityByName,
          });
          this.sendMail(
            !activityMeta.email ? false : activityMeta.email,
            vars.isMailOn,
            watcher.notificationId,
            finalResource,
            !activityMeta.emailtemplateUrl ? '' : activityMeta.emailtemplateUrl
          );
        }
      });

      if (activityMeta.notifyPageOnly) {
        this.sendNotificationToPage(activity, resource);
        if (!activityMeta.notifyPageRefresh) {
          return createdActivity;
        }
      }

      if (activityMeta.notifyPageRefresh) {
        this.sendPageRefreshNotification(activity, userDetails);
        return createdActivity;
      }
      logger.debug(className + methodName + ' end');
      return createdActivity;
    } catch (ex) {
      logger.error(className + methodName + 'Error: ' + Utils.stringify(ex));
      return {
        error: 'Unable to process request',
      };
    }
  }

  // tslint:disable-next-line: no-any
  _setCreatedAndFailedProductCount(resource: any) {
    const methodName = '[_setCreatedAndFailedProductCount]';
    logger.debug(className + methodName + 'start: ');
    const { tasks } = resource;
    const failedTasks: Task[] = tasks.filter((task: Task) => !task.productId);
    // tslint:disable-next-line: no-any
    const failedProducts: any = [];
    for (const failedTask of failedTasks) {
      // tslint:disable-next-line: no-any
      const jsonProduct: any = failedTask.taskJson;
      const product = JSON.parse(Buffer.from(jsonProduct).toString());
      failedProducts.push(product);
    }
    const failedTasksSize = failedTasks.length;
    const savedTasksSize = tasks.length - failedTasksSize;
    resource.createdProductCount = savedTasksSize;
    resource.failedProductCount = failedTasksSize;
    resource.failedProducts = failedProducts;
    logger.debug(
      className +
        methodName +
        'Success: The modified resource is ' +
        Utils.stringify(resource)
    );
    return resource;
  }

  filterWatchersByGroup(watchers: Watcher[], groups: WatcherGroup[]) {
    const methodName = '[filterWatchersByGroup]';
    logger.debug(className + methodName + 'start');
    if (groups.length === 0) {
      return watchers;
    }
    logger.debug(className + methodName + 'end');
    return watchers.filter(watcher => {
      const watcherGroups = watcher.groups.map(g => g.group);
      const intersection = watcherGroups.filter(value =>
        groups.includes(value)
      );
      return intersection.length > 0;
    });
  }

  async manageWatchersByDepartment(
    // tslint:disable-next-line: no-any
    resource: any,
    departments: string[],
    watchers: Watcher[]
  ) {
    const methodName = '[manageWatchersByDepartment]';
    logger.info(
      className +
        methodName +
        'start: Manage watchers by departments' +
        JSON.stringify({ resource, departments, watchers })
    );
    let merchId = null;
    let userDepartmentDetails;
    const watcherEmailIdList = watchers.map(w => w.notificationId);
    // tslint:disable-next-line: no-any
    let managedWatcherList: any = [...watchers];
    const productType =
      resource && resource.type && resource.type.type === 'TEXTILE'
        ? 'Textile'
        : 'Hardgoods';
    if (departments.includes(Constants.ALL_MERCHANDISER)) {
      // special case after first Confirm to TPReady
      logger.info(
        className +
          methodName +
          'Manage special case to notify one time, all merchdisers: ' +
          JSON.stringify({ resource, departments, watchers })
      );
      merchId = resource && resource.merchandise && resource.merchandise.teamId;
      if (merchId) {
        // for Null MerchId
        logger.info(
          className +
            methodName +
            'one time notify all merchandisers of merch id: ' +
            merchId +
            ' for ' +
            JSON.stringify({ resource, departments, watchers })
        );
        userDepartmentDetails = await this.getUserDepartmentEmailIds(
          productType,
          departments,
          merchId
        );
        const departmentMerchEmailIds =
          (userDepartmentDetails &&
            userDepartmentDetails[Constants.DEPARTMENT_MERCHANDISER]) ||
          [];
        managedWatcherList = await this.addAllMerchandisersToNotifyOneTime(
          watchers,
          departmentMerchEmailIds,
          watcherEmailIdList
        );
        managedWatcherList = this.filterWatcherByDepartmentEmailIds(
          userDepartmentDetails,
          managedWatcherList
        );
        logger.info(
          className +
            methodName +
            'End: all merchandisers associated to merchId ' +
            merchId +
            ' and new watcher list is ' +
            JSON.stringify({ managedWatcherList })
        );
        return managedWatcherList;
      } else return managedWatcherList;
    } else {
      userDepartmentDetails = await this.getUserDepartmentEmailIds(
        productType,
        departments,
        merchId
      );
      managedWatcherList = this.filterWatcherByDepartmentEmailIds(
        userDepartmentDetails,
        managedWatcherList
      );
      logger.info(
        className +
          methodName +
          'End: ' +
          JSON.stringify({ resource, departments, watchers })
      );
      return managedWatcherList;
    }
  }

  filterWatcherByDepartmentEmailIds(
    userDepartmentDetails: { string: string[] },
    watcherList: Watcher[]
  ) {
    const methodName = '[filterWatcherByDepartmentEmailIds]';
    logger.info(className + methodName + 'start:');
    const allDepartmentEmailIds: string[] = [];
    for (const [key, value] of Object.entries(userDepartmentDetails)) {
      allDepartmentEmailIds.push(...value);
    }
    if (allDepartmentEmailIds.length) {
      logger.debug(
        className +
          methodName +
          'filter watcher list with emailIds :' +
          JSON.stringify({ allDepartmentEmailIds })
      );
      const filteredWatcherList = watcherList.filter(watchers =>
        allDepartmentEmailIds.includes(watchers.notificationId)
      );
      logger.debug(
        className +
          methodName +
          'End: ' +
          JSON.stringify({ filteredWatcherList })
      );
      return filteredWatcherList;
    }
    logger.debug(
      className + methodName + 'End: ' + JSON.stringify({ watcherList })
    );
    logger.info(className + methodName + 'End:');
    return watcherList;
  }

  addAllMerchandisersToNotifyOneTime(
    watchers: Watcher[],
    departmentMerchEmailIds: string[],
    watcherEmailIdList: string[]
  ) {
    const methodName = '[addAllMerchandisersInWatchers]';
    logger.info(
      className +
        methodName +
        'Start: ' +
        JSON.stringify({
          watchers,
          departmentMerchEmailIds,
          watcherEmailIdList,
        })
    );
    // tslint:disable-next-line: no-any
    const managedWatcherList: any = [...watchers];
    departmentMerchEmailIds.forEach(departmentMerchEmail => {
      if (!watcherEmailIdList.includes(departmentMerchEmail)) {
        managedWatcherList.push({ notificationId: departmentMerchEmail });
      }
    });
    logger.info(
      className +
        methodName +
        'End: managedWatcherList: ' +
        JSON.stringify({ managedWatcherList })
    );
    return managedWatcherList;
  }

  async getUserDepartmentEmailIds(
    productType: string,
    departments: string[],
    merchId: string | null
  ) {
    const methodName = '[getUserDepartmentEmailIds]';
    logger.debug(className + methodName + ' start');
    const authGateway = AuthGateway.createInstance();
    try {
      const userDepartmentResponse = await authGateway.fetchUserDepartmentEmailIds(
        productType,
        departments,
        merchId
      );
      logger.debug(className + methodName + ' end');
      return userDepartmentResponse.data.result || [];
    } catch (
      // tslint:disable-next-line: no-any
      error
    ) {
      logger.error(
        className +
          methodName +
          'Error while fetching user department emailIds: ' +
          error
      );
      return {
        error_message: 'Error while fetching user department emailIds',
        error: error.response,
      };
    }
  }

  createNotification(notificationPayload: CreateNotificationPayload) {
    const methodName = '[createNotification]';
    const {
      resource,
      message,
      sender,
      receiver,
      senderName,
      receiverName,
      activityType,
      createdActivity,
    } = notificationPayload;
    logger.info(className + methodName + ' :start');
    logger.debug(
      className + methodName + 'Receiver: ' + receiver + ' message: ' + message
    );

    const product = resource.productDetails || resource;
    if (!product.productIdentifier || !product.productIdentifier.pid) return;
    const notification = {} as Notification;
    notification.userId = receiver;
    notification.senderName = senderName;
    notification.userName = receiverName;
    notification.message = message;
    notification.messageId = activityType;
    notification.productName = product.name;
    notification.productRevisionVersion = product.revisionVersion;
    notification.referenceId = product.productIdentifier.pid;
    notification.createdBy = sender;
    notification.selectionId = product.selection ? product.selection.sid : 0;
    if (product.metadata) {
      if (product.metadata.themeWeek && product.metadata.theme) {
        notification.theme =
          (product.metadata.themeWeek.wid === '0'
            ? ''
            : product.metadata.themeWeek.wid) +
          ' - ' +
          product.metadata.theme;
      } else if (product.metadata.themeWeek && !product.metadata.theme) {
        notification.theme =
          (product.metadata.themeWeek.wid === '0'
            ? ''
            : product.metadata.themeWeek.wid) + ' - ';
      } else if (!product.metadata.themeWeek && product.metadata.theme) {
        notification.theme = ' - ' + product.metadata.theme;
      } else {
        notification.theme = '';
      }
    } else {
      notification.theme = '';
    }
    notification.referenceType = 'product';
    notification.ian = product.ian;
    notification.thumbnail = Utils.findThumb200(product);

    if (createdActivity) {
      notification.activity = createdActivity;
    }

    logger.info(
      className +
        methodName +
        'end' +
        'Notifcation: ' +
        JSON.stringify(notification)
    );
    return this.notificationDAO.insert(notification);
  }

  sendNotificationToPage(
    activity: Activity,
    // tslint:disable-next-line: no-any
    resource: any
  ) {
    const methodName = '[sendNotificationToPage]';
    logger.debug(className + methodName + 'start');

    const usersToNotify = this.ioService.getUsersOfRoom(activity.origin);
    usersToNotify.forEach(user => {
      if (user !== activity.activityBy) {
        this.ioService.sendEvent(user, activity.type, {
          ...resource,
          message: activity.message,
          notificationFor: activity.origin,
        });
      }
    });
    logger.debug(className + methodName + 'end');
  }

  // tslint:disable-next-line: no-any
  sendPageRefreshNotification(activity: Activity, userDetails: any) {
    const methodName = '[sendPageRefreshNotification]';
    logger.debug(className + methodName + 'start');

    const usersToNotify = this.ioService.getUsersOfRoom(activity.origin);
    usersToNotify.forEach(user => {
      const userBuyerDetail = userDetails.find(
        // tslint:disable-next-line: no-any
        (eachUser: any) => eachUser.email === user
      );
      if (user !== activity.activityBy) {
        if (
          userBuyerDetail.isBuyer &&
          (activity.type === 'EDIT_PRODUCT' ||
            activity.type === 'PRODUCT_LOCK_RELEASE')
        ) {
          return;
        } else {
          this.ioService.sendEvent(user, 'PAGE_REFRESH', {
            notificationFor: activity.origin,
          });
        }
      }
    });
    logger.debug(className + methodName + 'end');
  }

  async sendMail(
    isActivityMetaMailOn: boolean,
    isAppLevelMailOn: boolean,
    receiver: string,
    // tslint:disable-next-line: no-any
    resource: any,
    emailtemplateUrl: string
  ) {
    const methodName = '[sendMail]';
    logger.debug(className + methodName + 'start');

    const preference = await this.preferenceDAO.getPreference(receiver);
    let schedulerCall = false;
    let subject;
    const { status } = resource;
    if (status && status === Constants.JOB_STATUS.PROCESSED) {
      resource.productCatalogUrl =
        vars.baseUrl + `/pcp-products#reference_${resource.jobId}`;
      schedulerCall = true;
      subject = `[PCP]-[Import Products]`;
    } else if (
      status &&
      [Constants.JOB_STATUS.FAILED, Constants.JOB_STATUS.INCOMPLETE].includes(
        status
      )
    ) {
      schedulerCall = true;
      subject = `[PCP]-[Import Products]`;
    } else {
      subject = `[PCP] - [${resource.ian ||
        resource.productIdentifier?.pid ||
        '-'} / ${resource.selection?.sid || '-'} ] - ${resource.name}`;
    }
    if (
      isActivityMetaMailOn &&
      isAppLevelMailOn &&
      preference &&
      preference.emailNotification
    ) {
      this.emailService.sendEmail(
        receiver,
        schedulerCall,
        subject,
        resource,
        emailtemplateUrl
      );
    }
    logger.debug(className + methodName + 'end');
  }

  async createNotificationForImportProducts(
    notificationPayload: CreateNotificationPayload
  ) {
    const methodName = '[createNotificationForImportProducts]';
    logger.debug(className + methodName + 'start');

    const {
      message,
      sender,
      receiver,
      senderName,
      receiverName,
      activityType,
      resourceId,
      createdActivity,
    } = notificationPayload;
    const notification = {} as Notification;
    notification.userId = receiver;
    notification.userName = receiverName;
    notification.senderName = senderName;
    notification.message = message;
    notification.messageId = activityType;
    notification.createdBy = sender;
    notification.referenceType = Constants.IMPORT_PRODUCT_REFERENCE_TYPE;
    if (resourceId) {
      notification.referenceId = resourceId;
    }
    notification.productName = Constants.IMPORT_PRODUCT_NAME;

    if (createdActivity) {
      notification.activity = createdActivity;
    }

    logger.debug(className + methodName + 'end');
    return this.notificationDAO.insert(notification);
  }

  async getUserDetails(userType?: string) {
    const methodName = '[getUserDetails]';
    logger.info(className + methodName + ' start');
    const authGateway = await AuthGateway.createInstance();
    try {
      const userDetailsResponse = await authGateway.fetchUserDetails(userType);
      logger.info(className + methodName + ' end');
      return userDetailsResponse.data.result || [];
    } catch (error) {
      logger.error(className + methodName + 'error: ' + error);
      return {
        error_message: 'Error while fetching userdetails',
        error: error.response,
      };
    }
  }

  // tslint:disable-next-line: no-any
  _checkCommentTypePermission(user: any, activity: Activity) {
    const methodName = '[_checkCommentTypePermission]';
    logger.debug(className + methodName + ' start:');
    logger.debug(
      'user: ' +
        Utils.stringify(user) +
        ' and activity: ' +
        Utils.stringify(activity)
    );
    if (
      user &&
      !user.isBuyer &&
      activity.commentActivityType === Constants.INTERNAL_COMMENT
    ) {
      return user.permissions.includes(Constants.PCP_VIEW_COMMENTS);
    } else if (
      user &&
      activity.commentActivityType === Constants.EXTERNAL_COMMENT
    ) {
      return user.permissions.includes(Constants.PCP_VIEW_BUYER_COMMENTS);
    } else if (
      user &&
      user.isBuyer &&
      activity.commentActivityType === Constants.BUYERS_INTERNAL_COMMENT
    ) {
      return user.permissions.includes(
        Constants.PCP_VIEW_INTERNAL_BUYERS_COMMENTS
      );
    } else {
      return false;
    }
  }

  async isNotificationEnabled(userId: string, merchId: string) {
    const methodName = '[isNotificationEnabled]';
    logger.debug(className + methodName + 'start: ');
    const preference = await this.preferenceDAO.getPreference(userId);
    logger.info(
      className +
        methodName +
        ' preference: isNotificationEnabled ' +
        preference
    );
    if (preference) {
      const merchTeamPreference = preference.merchTeamPreference.find(
        (team: MerchTeamPreference) => team.teamId === merchId
      );
      logger.info(
        className +
          methodName +
          ' notificationEnabled: merchTeamPreference ' +
          merchTeamPreference
      );
      if (merchTeamPreference) {
        return merchTeamPreference.enableNotification;
      }
    }
    return false;
  }
}
