import React, { Component } from 'react';
import { HeaderItem, HeaderRow, Table, TableRow } from '../../components/Table';
import PropTypes from 'prop-types';
import { withRouter } from 'react-router';
import connect from 'react-redux/es/connect/connect';
import cn from 'classnames';
import { Resource } from 'hsd/lib/dns/resource';
import CreateRecord from './CreateRecord';
import EditableRecord from './EditableRecord';
import * as nameActions from '../../ducks/names';
import deepEqual from 'deep-equal';
import * as logger from '../../utils/logClient';
import { showSuccess } from '../../ducks/notifications';
import { clientStub as aClientStub } from '../../background/analytics/client';
import {clearDeeplinkParams} from "../../ducks/app";

const analytics = aClientStub(() => require('electron').ipcRenderer);

const DEFAULT_RESOURCE = {
  __isDefault__: true,
  records: [],
};

class Records extends Component {
  static propTypes = {
    name: PropTypes.string.isRequired,
    resource: PropTypes.object,
    pendingData: PropTypes.object,
    deeplinkParams: PropTypes.object.isRequired,
    showSuccess: PropTypes.func.isRequired,
    sendUpdate: PropTypes.func.isRequired,
    clearDeeplinkParams: PropTypes.func.isRequired,
    transferring: PropTypes.bool.isRequired,
  };

  shouldComponentUpdate(nextProps, nextState, nextContext) {
    return !deepEqual(this.props, nextProps) || !deepEqual(this.state, nextState);
  }

  static renderHeaders() {
    return (
      <HeaderRow>
        <HeaderItem>
          <div>Type</div>
        </HeaderItem>
        <HeaderItem>Value</HeaderItem>
        <HeaderItem />
      </HeaderRow>
    );
  }

  constructor(props) {
    super(props);
    this.state = {
      isUpdating: false,
      errorMessage: '',
      updatedResource: DEFAULT_RESOURCE,
    };
  }

  static getDerivedStateFromProps(props, state) {
    let updatedResource = JSON.parse(JSON.stringify(state.updatedResource));

    if (updatedResource.__isDefault__) {
      if (props.resource) {
        updatedResource = props.resource;
      }

      return {
        ...state,
        updatedResource: updatedResource,
      };
    }

    if (props.deeplinkParams.txt && props.domain && props.domain.isOwner) {
      props.clearDeeplinkParams();

      if (props.resource) {
        updatedResource = props.resource;
      }

      updatedResource.records.push({
        type: 'TXT',
        txt: [props.deeplinkParams.txt],
      });

      return {
        ...state,
        updatedResource: updatedResource,
      };
    }

    return state;
  }

  hasChanged = () => {
    const oldResource = this.props.resource;
    const updatedResource = this.state.updatedResource;

    if (!oldResource && !updatedResource) {
      return false;
    }

    if (!oldResource && updatedResource) {
      return true;
    }

    if (oldResource && !updatedResource) {
      return false;
    }

    return !deepEqual(oldResource, updatedResource);
  };

  sendUpdate = async () => {
    this.setState({isUpdating: true});
    try {
      const {updatedResource} = this.state;
      await this.props.sendUpdate(this.props.name, updatedResource);
      this.setState({isUpdating: false});
      this.props.showSuccess('Your update request is sent successfully! It should be confirmed in 15 minutes.');
      analytics.track('updated domain');
    } catch (e) {
      logger.error(`Error received from Records.js - sendUpdate\n\n${e.message}\n${e.stack}\n`);
      this.setState({
        isUpdating: false,
        errorMessage: e.message,
      });
    }
  };

  onCreate = async (record) => {
    const updatedResource = JSON.parse(JSON.stringify(this.state.updatedResource));
    updatedResource.records.push(record);
    this.setState({
      updatedResource,
    });
  };

  onRemove = i => {
    const updatedResource = JSON.parse(JSON.stringify(this.state.updatedResource));
    updatedResource.records.splice(i, 1);
    this.setState({
      updatedResource,
    });
  };

  makeOnEdit = i => async (record) => {
    const updatedResource = JSON.parse(JSON.stringify(this.state.updatedResource));
    updatedResource.records[i] = record;
    this.setState({
      updatedResource,
    });
  };

  renderRows() {
    const resource = this.state.updatedResource;
    const oldResource = this.props.resource;

    return resource.records.map((record, i) => {
      const oldrecord = oldResource && oldResource.records[i];

      return (
        <EditableRecord
          key={`${this.props.name}-${record.type}-${i}`}
          className={deepEqual(oldrecord, record) ? '' : 'edited-record'}
          name={this.props.name}
          record={record}
          onEdit={this.makeOnEdit(i)}
          onRemove={() => this.onRemove(i)}
          disabled={!this.props.domain || !this.props.domain.isOwner}
        />
      );
    });
  }

  renderCreateRecord() {
    return (
      <CreateRecord
        name={this.props.name}
        onCreate={this.onCreate}
        disabled={!this.props.domain || !this.props.domain.isOwner}
      />
    );
  }

  renderActionRow() {
    return (this.props.domain && this.props.domain.isOwner) && (
      <TableRow className="records-table__action-row">
        <div className="records-table__action-row__error-message">
          {this.state.errorMessage}
        </div>
        <button
          className="records-table__action-row__submit-btn"
          disabled={!this.hasChanged() || this.state.isUpdating}
          onClick={this.sendUpdate}
        >
          Submit
        </button>
        <button
          className="records-table__action-row__dismiss-link"
          onClick={() => this.setState({updatedResource: DEFAULT_RESOURCE})}
          disabled={!this.hasChanged() || this.state.isUpdating}
        >
          Discard Changes
        </button>
      </TableRow>
    );
  }

  renderPendingUpdateOverlay() {
    return (
      <div className="records-table__pending-overlay">
        <div className="records-table__pending-overlay__content">Updating records...</div>
      </div>
    );
  }

  renderTransferringOverlay() {
    return (
      <div className="records-table__pending-overlay">
        <div className="records-table__pending-overlay__content">Domain cannot be modified while a transfer is in progress.</div>
      </div>
    );
  }

  render() {
    const {
      pendingData,
      transferring,
      domain = {},
    } = this.props;
    return (
      <div>
        <Table
          className={cn('records-table', {
            'records-table--pending': pendingData,
          })}
        >
          {Records.renderHeaders()}
          {this.renderRows()}
          {!pendingData ? this.renderCreateRecord() : null}
          {!pendingData ? this.renderActionRow() : null}
          {pendingData ? this.renderPendingUpdateOverlay() : null}
          {transferring || domain.pendingOperation === 'TRANSFER' ? this.renderTransferringOverlay() : null}
        </Table>
      </div>
    );
  }
}

export default withRouter(
  connect(
    (state, ownProps) => {
      const domain = state.names[ownProps.name];
      const resource = getDecodedResource(domain);
      const deeplinkParams = state.app.deeplinkParams;

      return {
        domain,
        resource,
        pendingData: getPendingData(domain),
        deeplinkParams,
      };
    },
    dispatch => ({
      sendUpdate: (name, json) => dispatch(nameActions.sendUpdate(name, json)),
      showSuccess: (message) => dispatch(showSuccess(message)),
      clearDeeplinkParams: () => dispatch(clearDeeplinkParams()),
    }),
  )(Records),
);

function getDecodedResource(domain) {
  const {info} = domain || {};

  if (!info) {
    return;
  }

  const {data} = info;

  if (!data) {
    return;
  }

  return {
    records: [],
    ...Resource.decode(new Buffer(data, 'hex')).toJSON(),
  };
}

function getPendingData(domain) {
  if (!domain) {
    return null;
  }

  if (domain.pendingOperation === 'UPDATE' || domain.pendingOperation === 'REGISTER') {
    return getDecodedResource({
      info: {
        data: domain.pendingOperationMeta.data,
      },
    });
  }

  return null;
}

