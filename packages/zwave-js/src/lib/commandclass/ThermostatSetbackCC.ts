import {
	CommandClasses,
	validatePayload,
	ValueMetadata,
	ZWaveError,
	ZWaveErrorCodes,
} from "@zwave-js/core";
import type { Maybe } from "@zwave-js/core";
import { getEnumMemberName } from "@zwave-js/shared";
import type { Driver } from "../driver/Driver";
import log from "../log";
import {
	decodeSetbackState,
	encodeSetbackState,
	SetbackState,
} from "../values/SetbackState";
import { CCAPI } from "./API";
import {
	API,
	CCCommand,
	CCCommandOptions,
	ccValue,
	ccValueMetadata,
	CommandClass,
	commandClass,
	CommandClassDeserializationOptions,
	expectedCCResponse,
	gotDeserializationOptions,
	implementedVersion,
} from "./CommandClass";

export enum ThermostatSetbackCommand {
	Set = 0x01,
	Get = 0x02,
	Report = 0x03,
}

/**
 * @publicAPI
 */
export enum SetbackType {
	None = 0x00,
	Temporary = 0x01,
	Permanent = 0x02,
}

// @noSetValueAPI
// The setback state consist of two values that must be set together

@API(CommandClasses["Thermostat Setback"])
export class ThermostatSetbackCCAPI extends CCAPI {
	public supportsCommand(cmd: ThermostatSetbackCommand): Maybe<boolean> {
		switch (cmd) {
			case ThermostatSetbackCommand.Get:
			case ThermostatSetbackCommand.Set:
				return true; // This is mandatory
		}
		return super.supportsCommand(cmd);
	}

	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
	public async get() {
		this.assertSupportsCommand(
			ThermostatSetbackCommand,
			ThermostatSetbackCommand.Get,
		);

		const cc = new ThermostatSetbackCCGet(this.driver, {
			nodeId: this.endpoint.nodeId,
			endpoint: this.endpoint.index,
		});
		const response = (await this.driver.sendCommand<
			ThermostatSetbackCCReport
		>(cc))!;
		return {
			setbackType: response.setbackType,
			setbackState: response.setbackState,
		};
	}

	public async set(
		setbackType: SetbackType,
		setbackState: SetbackState,
	): Promise<void> {
		this.assertSupportsCommand(
			ThermostatSetbackCommand,
			ThermostatSetbackCommand.Get,
		);

		const cc = new ThermostatSetbackCCSet(this.driver, {
			nodeId: this.endpoint.nodeId,
			endpoint: this.endpoint.index,
			setbackType,
			setbackState,
		});
		await this.driver.sendCommand(cc);
	}
}

@commandClass(CommandClasses["Thermostat Setback"])
@implementedVersion(1)
export class ThermostatSetbackCC extends CommandClass {
	declare ccCommand: ThermostatSetbackCommand;

	public async interview(complete: boolean = true): Promise<void> {
		const node = this.getNode()!;
		const endpoint = this.getEndpoint()!;
		const api = endpoint.commandClasses["Thermostat Setback"];

		log.controller.logNode(node.id, {
			endpoint: this.endpointIndex,
			message: `${this.constructor.name}: doing a ${
				complete ? "complete" : "partial"
			} interview...`,
			direction: "none",
		});

		// Always query the thermostat state
		log.controller.logNode(node.id, {
			endpoint: this.endpointIndex,
			message: "querying the current thermostat state...",
			direction: "outbound",
		});
		const setbackResp = await api.get();
		const logMessage = `received current state:
setback type:  ${getEnumMemberName(SetbackType, setbackResp.setbackType)}
setback state: ${setbackResp.setbackState}`;
		log.controller.logNode(node.id, {
			endpoint: this.endpointIndex,
			message: logMessage,
			direction: "inbound",
		});

		// Remember that the interview is complete
		this.interviewComplete = true;
	}
}

interface ThermostatSetbackCCSetOptions extends CCCommandOptions {
	setbackType: SetbackType;
	setbackState: SetbackState;
}

@CCCommand(ThermostatSetbackCommand.Set)
export class ThermostatSetbackCCSet extends ThermostatSetbackCC {
	public constructor(
		driver: Driver,
		options:
			| CommandClassDeserializationOptions
			| ThermostatSetbackCCSetOptions,
	) {
		super(driver, options);
		if (gotDeserializationOptions(options)) {
			// TODO: Deserialize payload
			throw new ZWaveError(
				`${this.constructor.name}: deserialization not implemented`,
				ZWaveErrorCodes.Deserialization_NotImplemented,
			);
		} else {
			this.setbackType = options.setbackType;
			this.setbackState = options.setbackState;
		}
	}

	public setbackType: SetbackType;
	/** The offset from the setpoint in 0.1 Kelvin or a special mode */
	public setbackState: SetbackState;

	public serialize(): Buffer {
		this.payload = Buffer.from([
			this.setbackType & 0b11,
			encodeSetbackState(this.setbackState),
		]);
		return super.serialize();
	}
}

@CCCommand(ThermostatSetbackCommand.Report)
export class ThermostatSetbackCCReport extends ThermostatSetbackCC {
	public constructor(
		driver: Driver,
		options: CommandClassDeserializationOptions,
	) {
		super(driver, options);

		validatePayload(this.payload.length >= 2);
		this._setbackType = this.payload[0] & 0b11;
		// If we receive an unknown setback state, return the raw value
		this._setbackState =
			decodeSetbackState(this.payload[1]) || this.payload[1];
		this.persistValues();
	}

	private _setbackType: SetbackType;
	@ccValue()
	@ccValueMetadata({
		// TODO: This should be a value list
		...ValueMetadata.Any,
		label: "Setback type",
	})
	public get setbackType(): SetbackType {
		return this._setbackType;
	}

	private _setbackState: SetbackState;
	/** The offset from the setpoint in 0.1 Kelvin or a special mode */
	@ccValue()
	@ccValueMetadata({
		...ValueMetadata.Int8,
		min: -12.8,
		max: 12,
		label: "Setback state",
	})
	public get setbackState(): SetbackState {
		return this._setbackState;
	}
}

@CCCommand(ThermostatSetbackCommand.Get)
@expectedCCResponse(ThermostatSetbackCCReport)
export class ThermostatSetbackCCGet extends ThermostatSetbackCC {
	public constructor(
		driver: Driver,
		options: CommandClassDeserializationOptions | CCCommandOptions,
	) {
		super(driver, options);
	}
}